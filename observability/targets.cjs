'use strict';
function checkTargets(targets){
 const required=['prometheus','tcc-committed','postgres','containers-linux-vm'];
 if(!Array.isArray(targets)||targets.some(t=>!required.includes(t.labels?.job)&&t.labels?.job!=='tcc-phase-e-load'))throw Error('Unknown monitoring target');
 for(const job of required){const matches=targets.filter(t=>t.labels.job===job);if(matches.length!==1||matches[0].health!=='up')throw Error('Required monitoring target unavailable');}
 const load=targets.filter(t=>t.labels.job==='tcc-phase-e-load');if(load.length>1)throw Error('Duplicate load target');
 return {requiredUp:required.length,optionalLoad:load[0]?.health??null};
}
module.exports={checkTargets};
