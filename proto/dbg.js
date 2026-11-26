import { solve, reachOf } from '../src/plan.js';
import { corner } from '../src/scene.js';
import { orient, rotation, HOLDS, clear, extent } from '../src/geom.js';
const dims=[90.36,90,80], reach=reachOf(dims);
const sc=corner({a:100,b:100,ceiling:82,reach});
const r=solve(dims,sc,{margin:1,slack:0.5}); console.log(r.found,r.explored,r.seeds);
const o=orient(dims,rotation(HOLDS[1],0,0)); console.log(HOLDS[1],o.top,o.minx,o.maxx,o.miny,o.maxy);
for (const [x,y] of [[50,-100],[50,0],[50,50],[100,50],[150,50]]) console.log(x,y,clear(sc,o,x,y,1.5), sc.goal(extent(o,x,y)));
