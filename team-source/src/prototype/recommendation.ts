import type { Conditions, Menu, Recommendation } from './types';
import { negatedTerms, NOODLE, parseBudget, parseParty, stripNegated } from './parse';
// 프로토타입용 규칙 모듈. 서버 LLM·DB를 호출하지 않습니다.
export const KIND_OPTIONS=['베이징덕/생선','딤섬','야채','냉채/샐러드','스프/탕','치킨','돼지고기','소고기','면','밥','해산물'];
export const EXCLUDE_OPTIONS=['해산물','새우','돼지고기','소고기','닭고기','계란','견과류'];
// 버튼에는 없지만 말로 빼 달라고 할 수 있는 재료입니다.
export const EXCLUDE_WORDS=[...EXCLUDE_OPTIONS,'오리','생선','굴','전복','해삼','관자','땅콩'];
export const KIND_WORDS: [string,RegExp][]=[['베이징덕/생선',/베이징\s*덕|북경\s*오리|오리|생선/],['딤섬',/딤섬|만두|교자|하가우|쇼마이|소롱포|춘권/],['스프/탕',/스프|수프|산라탕/],['면',NOODLE],['밥',/밥/],['치킨',/치킨|닭/],['소고기',/소고기|우육/],['돼지고기',/돼지|탕수육|동파육/],['해산물',/해산물|해물|새우|전복|해삼|관자/],['냉채/샐러드',/냉채|샐러드/],['야채',/야채|채소|가지|두부/]];
export const KioskAI = {
 extract(text: string): Conditions {
  const party=parseParty(text);
  let spicy=null; if(/안\s*매|안\s*맵|맵지\s*않|순한|매운\s*(거|것|음식)?\S*\s*(못|안)\s*먹/.test(text))spicy=0;else if(/아주\s*매|많이\s*매/.test(text))spicy=3;else if(/약간\s*매|조금\s*매|매콤/.test(text))spicy=1;else if(/매운|맵게|얼큰/.test(text))spicy=2;
  // 부정 표현이 바로 붙은 재료만 뺍니다. "새우는 빼고 소고기는 좋아요"에서 소고기는 빼지 않습니다.
  const exclude=negatedTerms(text,EXCLUDE_WORDS);
  const {perPerson,total}=parseBudget(text);
  const wanted=stripNegated(text);
  return {party,spicy,kind:KIND_WORDS.find(([,re])=>re.test(wanted))?.[0]??'상관없음',texture:wanted.includes('바삭')?'바삭함':wanted.includes('쫄깃')?'쫄깃함':'상관없음',exclude,budget:total?Math.round(total/party):perPerson,totalBudget:total,raw:text};
 },
 recommend(c: Conditions,menus: Menu[]): Recommendation[] {
  const groups: Record<string,string[]>={'해산물':['해산물','새우','생선','게','해삼','전복','관자','굴','오징어','조개']};
  const excluded=c.exclude.flatMap(i=>groups[i]||[i]);
  // '해물'로만 적힌 메뉴는 어떤 해산물이 들어갔는지 모르므로, 새우·게 같은 해산물 하나라도 빼 달라고 하면 함께 뺍니다.
  if(excluded.some(i=>groups['해산물'].includes(i)))excluded.push('해산물');
  // 재료 목록이 비어 있으면 '들어간 게 없음'이 아니라 '아직 확인 안 됨'입니다. 빼 달라는 재료가 있으면 추천하지 않습니다.
  const unknown=(m: Menu)=>m.ingredients.length===0&&!m.ingredientsChecked;
  const allowed=(m: Menu)=>!m.soldOut&&!m.ingredients.some(i=>excluded.includes(i))&&!(excluded.length&&unknown(m))&&(c.spicy!==0||m.spicy===0);
  const said=stripNegated(c.raw).replace(/\s/g,'');
  const fit=(m: Menu)=>{
   let score=0;const reasons: string[]=[];
   const kw=m.keywords?.find(k=>said.includes(k));if(kw){score+=10;reasons.push(`말씀하신 ‘${kw}’ 메뉴예요`)}if(c.kind!=='상관없음'&&m.kind.includes(c.kind)){score+=8;reasons.push(`${c.kind} 메뉴를 원하셨어요`)}
   // 맵기 0은 '안 매움'과 '아직 모름'이 섞여 있어, 매장에서 확인한 메뉴(spicyChecked)만 안 맵다고 말합니다.
   if(c.spicy!==null&&m.spicy===c.spicy){if(c.spicy===0&&!m.spicyChecked){score+=2;reasons.push('맵다는 표시가 없는 메뉴예요')}else{score+=4;reasons.push(c.spicy===0?'안 매운 메뉴예요':'원하신 맵기와 맞아요')}}
   if(c.texture!=='상관없음'&&m.texture.includes(c.texture)){score+=3;reasons.push(`${c.texture} 식감 태그가 있어요`)}
   return {score,reasons};
  };
  const pool=menus.filter(allowed).map(m=>({m,...fit(m)})).sort((a,b)=>b.score-a.score);
  const limit=c.totalBudget??(c.budget?c.budget*c.party:Infinity);
  const candidates: Recommendation[]=[];
  // parts: [메뉴, 그 메뉴로 채울 인원] 목록. 인원을 메뉴의 인분으로 나눠 수량을 정합니다.
  const build=(parts: {m: Menu; score: number; reasons: string[]; people: number}[],bonus: number,extra: string[])=>{
   const lines=parts.map(p=>({id:p.m.id,quantity:Math.ceil(p.people/p.m.servingPeople)}));
   const total=lines.reduce((v,l,i)=>v+parts[i].m.price*l.quantity,0);
   if(total>limit)return;
   // 최소 인분 기준으로 인원보다 훨씬 많은 양이면 빼고, 조금 많으면 점수를 낮춥니다.
   const over=lines.reduce((v,l,i)=>v+l.quantity*(parts[i].m.servingMin??parts[i].m.servingPeople),0)-c.party;
   if(over>c.party)return;
   let score=parts.reduce((v,p)=>v+p.score,0)/parts.length+bonus-Math.max(0,over)*1.5;
   // 동점일 때 데이터 순서가 아니라, 예산의 80% 안팎을 쓰는 조합을 조금 더 앞에 둡니다.
   if(limit<Infinity)score+=2*Math.max(0,1-Math.abs(total/limit-.8)/.8);
   const reasons=[...new Set([...parts.flatMap(p=>p.reasons),...extra])];
   if(limit<Infinity)reasons.push(c.totalBudget?'확인한 총예산 이내예요':'확인한 1인당 예산 이내예요');if(!reasons.length)reasons.push('현재 조건으로 선택할 수 있는 메뉴예요');
   candidates.push({main:parts[0].m,lines,total,score,reasons});
  };
  for(const p of pool){
   const side=pool.find(s=>p.m.pairings.includes(s.m.id));
   build([{...p,people:c.party}],0,[]);
   // 곁들임은 인원 전체 분량이 아니라 다 같이 나눠 먹는 1개만 더합니다.
   if(side&&c.party>=2)build([{...p,people:c.party},{...side,people:side.m.servingPeople}],.5,[`${side.m.name}와 곁들이기 좋아요`]);
  }
  // 인원이 2명 이상이면 서로 다른 메뉴 2개로 인원을 나눠 채우는 조합도 후보에 넣습니다.
  if(c.party>=2){const half=Math.ceil(c.party/2);for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++)build([{...pool[i],people:half},{...pool[j],people:c.party-half}],1,['여러 메뉴를 나눠 드실 수 있어요']);}
  // 중식 한상: 중국집에서처럼 요리(탕수육처럼 나눠 먹는 메뉴)와 식사(짜장·짬뽕·볶음밥을 1인분씩, 서로 다른 메뉴로)를 함께 시키는 구성.
  // 요리는 3명당 1개, 식사는 사람 수만큼(최대 3가지로 나눔), 3명 이상이거나 혼자면 딤섬·스프 같은 곁들임 1개를 더합니다.
  const YORI=['chicken','pork','beef','seafood','duck-fish'],MEAL=['noodle','rice'],SIDE=['dimsum','soup','cold','vegetable'];
  const ofKind=(cats: string[])=>c.kind!=='상관없음'&&pool.some(p=>cats.includes(p.m.category)&&p.m.kind.includes(c.kind));
  const pick=(cats: string[],extra: (m: Menu)=>boolean,n: number)=>pool.filter(p=>cats.includes(p.m.category)&&extra(p.m)&&(!ofKind(cats)||p.m.kind.includes(c.kind))).sort((a,b)=>b.score-a.score||a.m.price-b.m.price).slice(0,n);
  // 식사 종류: 짜장·짬뽕·볶음밥처럼 겹치지 않게 고르면 점수를 더 줍니다.
  const mealType=(m: Menu)=>(m.keywords??[]).map(k=>k==='간짜장'?'짜장':k).find(k=>['짜장','짬뽕','볶음밥','덮밥','탕면','냉면','차우면','딴딴면','우육탕면','굴탕면','잡탕밥','잡채밥'].includes(k))??m.name;
  // 식사 후보는 가격순으로만 자르면 짬뽕처럼 조금 비싼 대표 메뉴가 빠지므로, 종류마다 가장 알맞은 메뉴를 먼저 하나씩 넣습니다.
  const allMeals=pick(MEAL,()=>true,99);
  const meals=[...new Map(allMeals.map(p=>[mealType(p.m),p])).values()].map(p=>allMeals.find(x=>mealType(x.m)===mealType(p.m))!).slice(0,7);
  const yori=pick(YORI,m=>m.servingPeople>=2,6),sides=pick(SIDE,m=>m.price<=20000,4);
  const combos=<T,>(arr: T[],k: number): T[][]=>k===0?[[]]:arr.flatMap((x,i)=>combos(arr.slice(i+1),k-1).map(rest=>[x,...rest]));
  const yoriCount=c.party>=2?Math.ceil(c.party/3):0,mealKinds=Math.min(c.party,3);
  const sideOptions=c.party>=3||ofKind(SIDE)?sides:[null];
  // 가벼운 구성: 1~2명이 딤섬·스프 같은 곁들임이나 "간단하게"를 말하면 요리 없이 식사와 곁들임을 함께 추천합니다(딤섬만 먹는 경우는 드묾).
  const namedSides=pool.filter(p=>SIDE.includes(p.m.category)&&p.m.keywords?.some(k=>said.includes(k)));
  const wantsLight=/간단|가볍|가벼운|출출/.test(c.raw);
  const light=c.party<=2&&(ofKind(SIDE)||namedSides.length>0||wantsLight);
  // "딤섬"처럼 종류를 말하면 그 종류 전체에서, 종류 없이 메뉴 이름만 말하면 그 메뉴에서 곁들임을 고릅니다.
  const lightSides=ofKind(SIDE)?sides:namedSides.length?namedSides.slice(0,4):sides;
  if(light&&meals.length>=c.party)for(const ms of combos(meals,c.party))for(const sd of lightSides){
   const parts=[...ms.map(p=>({p,q:1})),{p:sd,q:1}];
   const total=parts.reduce((v,x)=>v+x.p.m.price*x.q,0);
   if(total>limit)continue;
   const classic=new Set(ms.map(p=>mealType(p.m)).filter(t=>['짜장','짬뽕','볶음밥'].includes(t))).size;
   let score=parts.reduce((v,x)=>v+x.p.score,0)/parts.length+3+.7*classic+(namedSides.includes(sd)||sd.m.kind.includes(c.kind)?1:0);
   if(limit<Infinity)score+=2*Math.max(0,1-Math.abs(total/limit-.8)/.8);
   const mealNames=ms.map(p=>p.m.name).join('·');
   const reasons=[...new Set([c.party===1?`${mealNames}에 ${sd.m.name}를 곁들이는 가벼운 구성이에요`:`${mealNames}에 ${sd.m.name}를 함께 나눠 먹는 가벼운 구성이에요`,...parts.flatMap(x=>x.p.reasons)])];
   if(limit<Infinity)reasons.push(c.totalBudget?'확인한 총예산 이내예요':'확인한 1인당 예산 이내예요');
   candidates.push({main:sd.m,lines:parts.map(x=>({id:x.p.m.id,quantity:x.q})),total,score,reasons,set:true,light:true});
  }
  // 혼자일 때는 양이 적을 수 있어 한상 구성 없이 식사 한 그릇만 추천합니다. 가벼운 구성을 원하면 요리가 든 한상도 만들지 않습니다.
  if(c.party>=2&&!light&&meals.length>=mealKinds)for(const ys of combos(yori,yoriCount))for(const ms of combos(meals,mealKinds))for(const sd of sideOptions){
   const parts=[...ys.map(p=>({p,q:1})),...ms.map((p,i)=>({p,q:Math.floor(c.party/mealKinds)+(i<c.party%mealKinds?1:0)})),...(sd?[{p:sd,q:1}]:[])];
   const lines=parts.map(x=>({id:x.p.m.id,quantity:x.q}));
   const total=parts.reduce((v,x)=>v+x.p.m.price*x.q,0);
   if(total>limit)continue;
   const types=new Set(ms.map(p=>mealType(p.m))).size;
   // 중국집에서 흔히 함께 시키는 짜장·짬뽕·볶음밥이 섞이면 점수를 조금 더 줍니다.
   const classic=new Set(ms.map(p=>mealType(p.m)).filter(t=>['짜장','짬뽕','볶음밥'].includes(t))).size;
   let score=parts.reduce((v,x)=>v+x.p.score,0)/parts.length+3+.6*types+.7*classic+.4*parts.filter(x=>x.p.m.badge).length;
   if(limit<Infinity)score+=2*Math.max(0,1-Math.abs(total/limit-.8)/.8);
   const names=(ps: typeof pool)=>ps.map(p=>p.m.name).join('·');
   const what=ys.length?`${names(ys)}에 ${names(ms)}`:`${names(ms)}에 ${sd?sd.m.name:''}`;
   const reasons=[...new Set([c.party===1?`${what}, 혼자 드시기 좋은 식사와 곁들임 구성이에요`:`${what}처럼 여러 가지를 나눠 먹는 중식 한상 구성이에요`,...parts.flatMap(x=>x.p.reasons)])];
   if(limit<Infinity)reasons.push(c.totalBudget?'확인한 총예산 이내예요':'확인한 1인당 예산 이내예요');
   candidates.push({main:(ys[0]??ms[0]).m,lines,total,score,reasons,set:true});
  }
  // 추천 3개는 구성이 서로 다르게 고릅니다: 한상 구성은 요리가 겹치지 않게 최대 2개, 단품·두 메뉴 조합은 메뉴가 겹치지 않게.
  const picked: Recommendation[]=[];const used=new Set<string>();const usedMain=new Set<string>();
  // 원하는 종류가 있고 그 종류가 들어간 조합이 하나라도 있으면, 종류와 상관없는 조합은 보여 주지 않습니다.
  const wantsKind=(r: Recommendation)=>c.kind==='상관없음'||r.lines.some(l=>menus.find(m=>m.id===l.id)!.kind.includes(c.kind));
  const kindPool=candidates.some(wantsKind)?candidates.filter(wantsKind):candidates;
  // 혼자이고 종류나 메뉴 이름을 따로 말하지 않았다면 면·밥 같은 식사만 보여 줍니다.
  const named=pool.some(p=>p.m.keywords?.some(k=>said.includes(k)));
  const meal=(r: Recommendation)=>r.lines.every(l=>MEAL.includes(menus.find(m=>m.id===l.id)!.category));
  const soloMeals=c.party===1&&c.kind==='상관없음'&&!named&&!light&&kindPool.some(meal);
  // 혼자 드실 식사는 짜장·짬뽕·볶음밥처럼 종류가 겹치지 않게 고릅니다.
  // 점수가 같으면 중국집 대표 식사인 짜장 → 볶음밥 → 짬뽕 순으로 먼저 보여 줍니다.
  const classicRank=(r: Recommendation)=>{const i=['짜장','볶음밥','짬뽕'].indexOf(mealType(r.main));return i<0?9:i;};
  const soloSorted=kindPool.filter(meal).sort((a,b)=>b.score-a.score||classicRank(a)-classicRank(b));
  const lightPool=light?kindPool.filter(r=>r.light):[];
  const pool2=lightPool.length?lightPool:soloMeals?[...new Map(soloSorted.map(r=>[mealType(r.main),r] as const).reverse()).values()].reverse().sort((a,b)=>b.score-a.score||classicRank(a)-classicRank(b)):kindPool;
  const sorted=pool2.sort((a,b)=>b.score-a.score);
  const firstSet=sorted.find(r=>r.set);
  if(firstSet){picked.push(firstSet);usedMain.add(firstSet.main.id);}
  // 식사 구성 방식(면+밥, 면 2종, 밥 2종): 두 번째 구성은 첫 번째와 다른 방식이 먼저 오게 해서, 면+밥과 짜장+짬뽕 같은 면 2종이 함께 보이게 합니다.
  const pattern=(r: Recommendation)=>r.lines.map(l=>menus.find(m=>m.id===l.id)!.category).filter(c=>MEAL.includes(c)).sort().join();
  if(firstSet){const diff=sorted.filter(r=>r.set&&pattern(r)!==pattern(firstSet));const rest=sorted.filter(r=>!diff.includes(r));sorted.splice(0,sorted.length,...diff,...rest);}
  for(const r of sorted){
   if(picked.length===3)break;
   if(picked.includes(r))continue;
   // 두 번째 한상은 요리도 식사 구성도 첫 번째와 달라야 합니다.
   if(r.set){const meals=(x: Recommendation)=>x.lines.filter(l=>MEAL.includes(menus.find(m=>m.id===l.id)!.category)).map(l=>l.id).sort().join();if(usedMain.has(r.main.id)||(!r.light&&picked.filter(x=>x.set).length>=2)||picked.some(x=>x.set&&meals(x)===meals(r)))continue;picked.push(r);usedMain.add(r.main.id);}
   else{if(r.lines.some(l=>used.has(l.id)))continue;picked.push(r);r.lines.forEach(l=>used.add(l.id));}
  }
  // 혼자 드실 식사는 면만, 밥만 나오지 않게 면과 밥을 하나 이상씩 넣습니다(요청 조건에 똑같이 맞을 때만).
  if(soloMeals)for(const cat of ['noodle','rice']){const isCat=(r: Recommendation)=>menus.find(m=>m.id===r.lines[0].id)!.category===cat;const alt=pool2.find(r=>isCat(r)&&!picked.includes(r));if(alt&&!picked.some(isCat)&&alt.score>=Math.min(...picked.map(r=>r.score))){if(picked.length===3)picked.pop();picked.push(alt);}}
  // 한상 구성만 3개가 되지 않도록, 단품·두 메뉴 조합이 있으면 하나는 꼭 넣습니다.
  const simple=sorted.find(r=>!r.set);
  if(!lightPool.length&&simple&&!picked.some(r=>!r.set)){if(picked.length===3)picked.pop();picked.push(simple);}
  return picked;
 }
};

