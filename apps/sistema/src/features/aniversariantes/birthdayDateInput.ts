/** Entrada editorial recorrente. Ano em branco nunca vira ano fictício no banco. */
export interface BirthdayDateValue { birthDate:string; birthYearKnown:boolean }
export function parseBirthdayDateInput(dayMonth:string,yearText:string):BirthdayDateValue|null{
 const raw=dayMonth.trim();
 if(!/^\d{1,2}\/\d{1,2}$/.test(raw))return null;
 const [day,month]=raw.split("/").map(Number);
 const hasYear=yearText.trim().length>0;
 if(hasYear&&!/^\d{4}$/.test(yearText.trim()))return null;
 const year=hasYear?Number(yearText):2000; // apenas projeção visual bissexta
 if(year<1900||year>2100)return null;
 const check=new Date(Date.UTC(year,month-1,day,12));
 if(day<1||month<1||month>12||check.getUTCFullYear()!==year||
    check.getUTCMonth()+1!==month||check.getUTCDate()!==day)return null;
 return {birthDate:`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
   birthYearKnown:hasYear};
}
export function yearInputFromBirthday(date:string,known?:boolean):string {
 return known===false?"":date.slice(0,4);
}
export function dayMonthInputFromBirthday(date:string):string{
 const match=/^\d{4}-(\d{2})-(\d{2})$/.exec(date);
 return match?`${match[2]}/${match[1]}`:"";
}
