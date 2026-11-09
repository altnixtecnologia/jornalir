/** Relógios editáveis em HH:MM. O banco continua guardando deslocamentos em minutos.
 * Para eventos próximos da meia-noite, escolhemos a ocorrência mais próxima,
 * dentro do dia anterior, do próprio dia ou do dia seguinte.
 */
export function validCoverageClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function coverageClockAt(eventTime:string,minutesBefore:number):string{
  if(!validCoverageClock(eventTime)||!Number.isFinite(minutesBefore))return "";
  const [h,m]=eventTime.split(":").map(Number);
  const minute=((h*60+m-minutesBefore)%1440+1440)%1440;
  return String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0");
}
/** +60 significa uma hora antes; -10 significa dez minutos depois. */
export function coverageMinutesBefore(eventTime:string,clockTime:string):number|null{
  if(!validCoverageClock(eventTime)||!validCoverageClock(clockTime))return null;
  const [eh,em]=eventTime.split(":").map(Number);
  const [ch,cm]=clockTime.split(":").map(Number);
  let minutes=(eh*60+em)-(ch*60+cm);
  if(minutes>720)minutes-=1440;
  if(minutes< -720)minutes+=1440;
  return minutes;
}
