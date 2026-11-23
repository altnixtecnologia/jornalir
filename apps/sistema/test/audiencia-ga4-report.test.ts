import test from "node:test";
import assert from "node:assert/strict";
import {asAudiencePeriod,audienceDateRange,parseAudienceReports} from "../src/lib/audiencia/ga4Report";

test("períodos permitidos e datas sem ampliar 7 e 30 dias",()=>{
  assert.equal(asAudiencePeriod("invalid"),"7d");
  assert.deepEqual(audienceDateRange("7d","2026-11-23"),{startDate:"6daysAgo",endDate:"today"});
  assert.deepEqual(audienceDateRange("30d","2026-11-23"),{startDate:"29daysAgo",endDate:"today"});
  assert.deepEqual(audienceDateRange("month","2026-11-23"),{startDate:"2026-11-01",endDate:"today"});
});
test("métricas separadas, horários ordenados, localizações e ranking",()=>{
  const r=parseAudienceReports([
    {rows:[{metricValues:[{value:"120"},{value:"42"},{value:"67"}]}]},
    {rows:[{dimensionValues:[{value:"20261123"}],metricValues:[{value:"100"}]},
            {dimensionValues:[{value:"20261122"}],metricValues:[{value:"20"}]}]},
    {rows:[{dimensionValues:[{value:"19"}],metricValues:[{value:"70"}]},
            {dimensionValues:[{value:"08"}],metricValues:[{value:"15"}]}]},
    {rows:[{dimensionValues:[{value:"Brazil"},{value:"Santa Catarina"},{value:"Praia Grande"}],metricValues:[{value:"18"}]}]},
    {rows:[
      {dimensionValues:[{value:"/noticias/assunto-a"},{value:"ASSUNTO A | Informativo Regional"}],metricValues:[{value:"25"}]},
      {dimensionValues:[{value:"/noticias/assunto-a"},{value:"ASSUNTO A | Informativo Regional"}],metricValues:[{value:"5"}]},
      {dimensionValues:[{value:"https://malicioso.example"},{value:"mau"}],metricValues:[{value:"99"}]},
    ]},
  ]);
  assert.deepEqual([r.views,r.visitors,r.sessions],[120,42,67]);
  assert.deepEqual(r.hours.map(x=>x.hour),["08","19"]);
  assert.equal(r.days[0].date,"20261122");
  assert.equal(r.locations[0].place,"Praia Grande · Santa Catarina · Brazil");
  assert.deepEqual(r.articles.map(a=>[a.path,a.title,a.views]),[["/noticias/assunto-a","ASSUNTO A",30]]);
});
test("resposta vazia nunca inventa visualizações",()=>{
  const r=parseAudienceReports([]);
  assert.equal(r.views,0);assert.equal(r.articles.length,0);
});
