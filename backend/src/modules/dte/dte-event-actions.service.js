'use strict';
const {randomUUID}=require('crypto');
const {sequelize}=require('../../config/database');
const Event=require('./dte-event.model');
const {validateFiscalJson}=require('./dte-schema.service');
const {buildSignedFile}=require('./dte-file.service');
const fail=(message,statusCode=400)=>{const e=new Error(message);e.statusCode=statusCode;throw e;};
const buildEventInvalidation=(context,reason,generationCode=randomUUID().toUpperCase())=>{
  const {event,company}=context;
  const original=buildSignedFile(event.signedJws,event.receptionSeal,()=>event.officialEventJson);
  if(!event.signedJws||!event.receptionSeal)fail('Se necesita el evento firmado con sello de recepción');
  if (original.identificacion?.codigoGeneracion !== event.generationCode || String(original.emisor?.nit) !== String(company.nit || '').replace(/\D/g,'')) fail('El archivo firmado no corresponde al evento o al contribuyente',409);
  const receiver=original.documento||{};const issuer=original.emisor||{};
  const now=new Intl.DateTimeFormat('en-GB',{timeZone:'America/El_Salvador',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  return validateFiscalJson({
    identificacion:{version:3,ambiente:original.identificacion.ambiente,codigoGeneracion:generationCode,fecEmi:original.identificacion.fecEmi,horEmi:now,fusion:null},
    emisor:{nit:String(company.nit || '').replace(/\D/g,''),nombre:company.legalName,codEstableMH:issuer.codEstableMH||context.establishment?.establishmentCode||context.pointOfSale?.establishment?.establishmentCode||company.establishmentCode||null,codEstable:issuer.codEstable||null,codPuntoVentaMH:issuer.codPuntoVentaMH||context.pointOfSale?.code||company.pointOfSaleCode||null,codPuntoVenta:issuer.codPuntoVenta||null,telefono:String(company.phone || '').replace(/\D/g,''),correo:company.email},
    documento:{tipoDte:event.eventTypeCode,codigoGeneracion:event.generationCode,selloRecibido:event.receptionSeal,numeroControl:null,fecEmi:original.identificacion.fecEmi,codigoGeneracionR:null,tipoDocumento:receiver.tipoDocumento||null,numDocumento:receiver.numDocumento||null,nombre:receiver.nombre||null,telefono:receiver.telefono||null,correo:receiver.correo||null},
    motivo:{tipoAnulacion:2,motivoAnulacion:reason.motivoAnulacion,nombreResponsable:reason.nombreResponsable,tipDocResponsable:reason.tipDocResponsable,numDocResponsable:reason.numDocResponsable,nombreSolicita:reason.nombreSolicita,tipDocSolicita:reason.tipDocSolicita,numDocSolicita:reason.numDocSolicita}
  },'invalidation');
};
const invalidateEvent=async({id,user,reason})=>{
  const context=await require('./dte-events.service').getEventById({id,user});
  if(!['17','18'].includes(context.event.eventTypeCode))fail('Solo Retorno y Operaciones Especiales admiten esta invalidación');
  const {getTenthBusinessDayOfNextMonth}=require('./dte-invalidation-deadline.service');
  const response = context.event.mhResponseJson?.response;
  const received = response?.fhProcesamiento || response?.body?.fhProcesamiento || context.event.acceptedAt;
  if (!received) fail('Falta confirmar la fecha de recepción del evento');
  const deadline=new Date(`${getTenthBusinessDayOfNextMonth(received)}T23:59:59-06:00`);
  if(Date.now()>deadline.getTime())fail('Venció el plazo de invalidación de este evento');
  const record=await sequelize.transaction(async transaction=>{
    const row=await Event.findOne({where:{id,companyId:context.company.id},transaction,lock:transaction.LOCK.UPDATE});
    if(!row||row.status!=='ACEPTADO')fail('El evento no está disponible para invalidar',409);
    let record=row.invalidationRecordJson;
    if(record?.state==='SENDING'&&Date.now()-new Date(record.attemptedAt).getTime()<120000)fail('La invalidación está en proceso',409);
    if(!record?.signedJws){
      const json=buildEventInvalidation(context,reason||{});
      const signed=await require('./dte-signer.service').signDteJson({company:context.company,nit:context.company.nit,dteJson:json});
      record={json,signedJws:signed.signedJws};
    }
    record={...record,state:'SENDING',attemptedAt:new Date().toISOString()};
    await row.update({invalidationRecordJson:record},{transaction});return record;
  });
  try {
    const result=await require('./dte-transmission.service').transmitSignedInvalidation({invoice:context.event,company:context.company,officialInvalidationJson:record.json,signedJws:record.signedJws});
    const accepted=Boolean(result.accepted&&result.receptionSeal);
    await Event.update({...(accepted?{status:'ANULADO'}:{}),invalidationRecordJson:{...record,state:accepted?'ACCEPTED':'REJECTED',receptionSeal:result.receptionSeal||null,response:result.response}},{where:{id,companyId:context.company.id}});
    if(!accepted)fail(result.rejectionReason||'Hacienda rechazó la invalidación',422);
    return buildSignedFile(record.signedJws,result.receptionSeal);
  } catch(error) {
    // Preserve the exact signed UUID for recovery after an uncertain network response.
    if(error.statusCode!==422)await Event.update({invalidationRecordJson:{...record,state:'PENDING',lastError:error.message}},{where:{id,companyId:context.company.id}});
    throw error;
  }
};
const getInvalidationFile=async({id,user})=>{
  const {event}=await require('./dte-events.service').getEventById({id,user});
  const record=event.invalidationRecordJson;
  if(!record?.signedJws||!record.receptionSeal)fail('No hay una invalidación aceptada disponible',404);
  return buildSignedFile(record.signedJws,record.receptionSeal);
};
module.exports={buildEventInvalidation,invalidateEvent,getInvalidationFile};
