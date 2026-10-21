import {createHash} from 'crypto';
import {readFileSync,statSync} from 'fs';
import {TextDecoder} from 'util';
import type {Knex} from 'knex';
import {ConfigurationError} from './runtimeConfig';
export type SqlOperation='UPDATE'|'INSERT'|'DELETE';
export interface SqlEntry {sqlFile:string;table:string;targetTable?:string;operation?:SqlOperation;}
export interface SqlDefinition {version:1;text:string;hash:string;operation:SqlOperation;table:string;targetTable:string;dataSchema:string;}
type Token={kind:'word'|'identifier'|'binding'|'other';value:string;start:number;end:number};
const invalid=():never=>{throw new ConfigurationError('SQL inválido: use um DML UPDATE/INSERT/DELETE, destino declarado e bindings :inicio e :fim; consulte src/jobs/README.md');};
const maxBytes=1024*1024;
/** Lexical envelope, deliberately not a SQL grammar or security sandbox. */
function lex(text:string):Token[]{
 const tokens:Token[]=[];let i=0;
 while(i<text.length){
  const start=i,c=text[i];
  if(/\s/.test(c)){i++;continue;}
  if(text.startsWith('--',i)){const end=text.indexOf('\n',i);i=end<0?text.length:end+1;continue;}
  if(text.startsWith('/*',i)){
   i+=2;let depth=1;while(i<text.length&&depth){if(text.startsWith('/*',i)){depth++;i+=2;}else if(text.startsWith('*/',i)){depth--;i+=2;}else i++;}if(depth)invalid();continue;
  }
  const dollar=text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
  if(dollar){const end=text.indexOf(dollar,i+dollar.length);if(end<0)invalid();i=end+dollar.length;tokens.push({kind:'other',value:'literal',start,end:i});continue;}
  if(c==="'"||c==='"'){
   const escaped=c==="'"&&i>0&&/[eE]/.test(text[i-1])&&(i<2||!/[\w$]/.test(text[i-2]));
   i++;let closed=false;while(i<text.length){if(escaped&&text[i]==='\\'){i+=2;continue;}if(text[i]===c){if(text[i+1]===c){i+=2;continue;}i++;closed=true;break;}i++;}if(!closed)invalid();
   tokens.push({kind:c==='"'?'identifier':'other',value:c==='"'?text.slice(start+1,i-1).replace(/""/g,'"'):'literal',start,end:i});continue;
  }
  if(text.startsWith('::',i)){i+=2;tokens.push({kind:'other',value:'::',start,end:i});continue;}
  if(c===':'&&/[A-Za-z_]/.test(text[i+1]??'')){
   const name=text.slice(i+1).match(/^\w+/)![0];i+=name.length+1;
   if(!['inicio','fim'].includes(name)||text[i]===':'&&!text.startsWith('::',i)||text[start-1]==='\\')invalid();
   tokens.push({kind:'binding',value:name,start,end:i});continue;
  }
  if(/[A-Za-z_]/.test(c)){const word=text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)![0];i+=word.length;tokens.push({kind:'word',value:word,start,end:i});continue;}
  if(c==='?'||c==='\\'||c==='$'||c==='\0')invalid();
  i++;tokens.push({kind:'other',value:c,start,end:i});
 }
 return tokens;
}
export function validateSqlDefinition(text:string,entry:SqlEntry,dataSchema:string):SqlDefinition{
 if(typeof text!=='string'||!text.length||Buffer.byteLength(text,'utf8')>maxBytes||text.includes('\\?'))invalid();
 const tokens=lex(text);const semis=tokens.filter(t=>t.value===';');
 if(semis.length>1||semis.length===1&&tokens[tokens.length-1]!==semis[0])invalid();
 const words=tokens.filter(t=>t.kind==='word').map(t=>t.value.toUpperCase());
 const operation=tokens[0]?.value.toUpperCase() as SqlOperation;
 if(!['UPDATE','INSERT','DELETE'].includes(operation)||entry.operation&&entry.operation!==operation)invalid();
 const forbidden=new Set(['BEGIN','COMMIT','ROLLBACK','START','SAVEPOINT','RELEASE','CREATE','ALTER','DROP','TRUNCATE','GRANT','REVOKE','COPY','CALL','DO','WITH','RETURNING','MERGE','VACUUM','SET','RESET']);
 // SET is the mandatory UPDATE clause, not a second statement. Other SETs fail closed.
 if(words.some(w=>forbidden.has(w)&&!(w==='SET'&&operation==='UPDATE'))||words.filter(w=>w==='SET').length>(operation==='UPDATE'?1:0))invalid();
 if(words.filter(w=>['UPDATE','INSERT','DELETE'].includes(w)).length!==1)invalid();
 if(!tokens.some(t=>t.kind==='binding'&&t.value==='inicio')||!tokens.some(t=>t.kind==='binding'&&t.value==='fim'))invalid();
 let index=1;
 if(operation!=='UPDATE'){if(tokens[index]?.value.toUpperCase()!==(operation==='INSERT'?'INTO':'FROM'))invalid();index++;}
 const first=tokens[index++];if(!first||!['word','identifier'].includes(first.kind))invalid();
 let schema=dataSchema,target=first.value;
 if(tokens[index]?.value==='.'){schema=target;const next=tokens[index+1];if(!next||!['word','identifier'].includes(next.kind))invalid();target=next.value;}
 const targetTable=entry.targetTable??entry.table;
 if(schema!==dataSchema||target!==targetTable||operation!=='INSERT'&&targetTable!==entry.table)invalid();
 if(operation==='INSERT'&&!entry.targetTable)invalid();
 return {version:1,text,hash:createHash('sha256').update(text,'utf8').digest('hex'),operation,table:entry.table,targetTable,dataSchema};
}
export function readSqlDefinition(file:string,entry:SqlEntry,schema:string):SqlDefinition{
 let text:string;try{if(statSync(file).size>maxBytes)invalid();text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(file));}catch{throw new ConfigurationError('Arquivo SQL ausente, UTF-8 inválido ou maior que 1 MiB');}
 return validateSqlDefinition(text,entry,schema);
}
export function assertSqlSnapshot(def:SqlDefinition,entry:SqlEntry,schema:string):void{
 if(!def||def.version!==1)invalid();
 const validated=validateSqlDefinition(def.text,entry,schema);
 if(['hash','operation','table','targetTable','dataSchema'].some(k=>(def as any)[k] !== (validated as any)[k]))invalid();
}
/** Knex's named-binding regex is not lexical: shield comments/literals/casts first. */
export function bindSqlDefinition(db:Knex,def:SqlDefinition,inicio:string,fim:string){
 const placeholders=lex(def.text).filter(t=>t.kind==='binding');let end=0,sql='';
 const shield=(s:string)=>s.replace(/(:(\w+):(?=::)|:(\w+):(?!:)|:(\w+))/g,'\\$1').replace(/\?/g,'\\?');
 for(const token of placeholders){sql+=shield(def.text.slice(end,token.start))+'('+def.text.slice(token.start,token.end)+')';end=token.end;}
 sql+=shield(def.text.slice(end));
 return db.raw(sql,{inicio,fim});
}
