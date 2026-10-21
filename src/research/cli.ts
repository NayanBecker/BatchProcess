/** Historical research entrypoint. Not used by npm start/dev. */
async function main(){
 const [command,...args]=process.argv.slice(2);
 try{
  let result:any;
  if(command==='fixture') result=await require('../cli/fixture').fixtureCommand(args);
  else if(command==='manual') result=await require('../cli/manual').manualCommand(args);
  else if(command==='jobs') result=['NormalizeSocioNamesJob','CopySociosJob','DeleteMigratedJob'].join('\n');
  else if(!command||['help','--help'].includes(command)) result='Batch Framework CLI (historical research)\nfixture --help | manual --help | jobs';
  else throw new Error('Comando legado arquivado; use fixture/manual no laboratório');
  console.log(typeof result==='string'?result:JSON.stringify(result));
 }catch(e){console.error((e as Error).message);process.exitCode=1;}
}
void main();
