const test=require('node:test');
const assert=require('node:assert/strict');
const {diagnose}=require('../scripts/diagnosticar-firmador');
const {normalizeAllowedEventTypes}=require('../src/modules/companies/company-event-options');
const {suite}=require('./fixtures.cjs');
const s=suite(require('node:path').resolve(__dirname,'..'));
function context(){
 const doc={identificacion:{ambiente:'00'},emisor:{nit:'06140101011011'}};
 const calls=[];
 return {calls,doc,args:{company:{id:1,nit:doc.emisor.nit,environment:'TEST'},invoice:{companyId:1,id:2},builder:{buildOfficialStandardDteJson:()=>doc},signer:{signDteJson:async({dteJson})=>{calls.push('sign');return {signedJws:'header.'+Buffer.from(JSON.stringify(dteJson)).toString('base64url')+'.signature'};}},auth:{getHaciendaAuthorization:async()=>{calls.push('auth');return {token:'PRIVATE_TOKEN'};}},log:()=>{}}};
}
test('Diagnostico firma copia sin autenticar ni transmitir por defecto',async()=>{const c=context();assert.deepEqual(await diagnose(c.args),{signed:true,authenticated:false});assert.deepEqual(c.calls,['sign']);});
test('Diagnostico autentica solamente cuando se solicita y no imprime token',async()=>{const c=context(),messages=[];c.args.checkHacienda=true;c.args.log=m=>messages.push(m);await diagnose(c.args);assert.deepEqual(c.calls,['sign','auth']);assert.ok(!messages.join('').includes('PRIVATE_TOKEN'));});
test('Diagnostico rechaza otro contribuyente y otro ambiente antes de firmar',async()=>{for(const change of [c=>c.args.invoice.companyId=2,c=>c.doc.identificacion.ambiente='01']){const c=context();change(c);await assert.rejects(diagnose(c.args));assert.deepEqual(c.calls,[]);}});
test('Diagnostico detecta respuesta sin firma o con contenido distinto',async()=>{for(const signedJws of ['invalid','h.'+Buffer.from('{}').toString('base64url')+'.s']){const c=context();c.args.signer.signDteJson=async()=>({signedJws});await assert.rejects(diagnose(c.args));}});
test('Eventos nuevos requieren seleccion explicita y no habilitan al enviar vacio',()=>{assert.deepEqual(normalizeAllowedEventTypes([]),[]);assert.deepEqual(normalizeAllowedEventTypes(['17','18','17']),['17','18']);assert.throws(()=>normalizeAllowedEventTypes(['19']));});
test('Exportacion informa C3 de valor cero',()=>{const d=s.builder.buildOfficialStandardDteJson(s.standard('11'));assert.deepEqual(Array.from(d.cuerpoDocumento[0].tributos),['C3']);assert.equal(d.resumen.tributos[0].codigo,'C3');assert.equal(d.resumen.tributos[0].valor,0);});
test('Nota de credito relacionada a CCF separa totalIva del tributo',()=>{const d=s.builder.buildOfficialStandardDteJson({...s.standard('05'),relatedDocumentTypeCode:'03'});assert.equal(d.cuerpoDocumento[0].totalIva,0);assert.equal(d.resumen.totalIva,0);assert.ok(d.resumen.tributos[0].valor>0);});
test('Retorno consumidor final no informa pais ni tributos exclusivos del DTE original',()=>{const d=s.events.buildOfficialEventJson(s.eventContext('18'));assert.equal(d.documento.codPais,null);assert.equal(d.documento.nombrePais,null);assert.equal(d.resumen.tributos,null);});
