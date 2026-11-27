import { solve, reachOf } from '../src/plan.js';
import { corner, sideDoor, stairs } from '../src/scene.js';
const coarse = { step: 5, yawSteps: 72, pitchSteps: 18, maxStates: 3e6 };
const cs = [[[200,62,42],r=>corner({a:75,b:119,ceiling:226,reach:r})],[[201,73,58],r=>corner({a:106,b:118,ceiling:236,reach:r})],[[200,70,80],r=>sideDoor({a:100,b:80,doorH:200,t:12,past:100,ceiling:240,reach:r})],[[200,60,50],r=>stairs({w:80,n:12,rise:18,going:26,headroom:200,hc:240,b:90,turn:true,reach:r})]];
for (const [d,mk] of cs){ const sc=mk(reachOf(d)); for (const c of [true,false]){ const r=solve(d,sc,{...coarse,corridor:c}); const P=r.path; console.log(sc.kind,c,r.found,P?.length,'first',P&&[P[0].x,P[0].y].map(v=>+v.toFixed(1)),'seed',sc.seed.y,'bounds y0',sc.bounds.y0,'miny',P&&Math.min(...P.map(p=>p.y)).toFixed(1)); } }
