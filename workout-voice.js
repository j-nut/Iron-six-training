/* Voice command parsing for the workout screen. Pure logic: no microphone, DOM or network. */
(() => {
  const SMALL={zero:0,oh:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
  const UNIT_WORDS=new Set([...Object.keys(SMALL),'hundred']);
  const clean=value=>String(value||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9.\s-]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim();

  function standardNumber(tokens){
    let total=0,current=0,used=0;
    for(const token of tokens){
      if(!(token in SMALL)&&token!=='hundred')break;
      used++;
      if(token==='hundred')current=(current||1)*100;
      else current+=SMALL[token];
    }
    return used?{value:total+current,used}:null;
  }

  // Speech recognizers commonly render gym loads as "one eighty five" or "four oh five".
  // Those are not standard English number phrases, so handle the hundreds shorthand first.
  function spokenNumber(tokens){
    if(!tokens?.length)return null;
    if(/^\d+(?:\.\d+)?$/.test(tokens[0]))return {value:Number(tokens[0]),used:1};
    if(tokens.length>=3&&SMALL[tokens[0]]>=1&&SMALL[tokens[0]]<=9&&tokens[1]==='oh'&&SMALL[tokens[2]]>=0&&SMALL[tokens[2]]<=9)
      return {value:SMALL[tokens[0]]*100+SMALL[tokens[2]],used:3};
    if(tokens.length>=2&&SMALL[tokens[0]]>=1&&SMALL[tokens[0]]<=9&&tokens[1]!=='hundred'){
      const tail=standardNumber(tokens.slice(1));
      if(tail&&tail.value>=10&&tail.value<=99)return {value:SMALL[tokens[0]]*100+tail.value,used:1+tail.used};
    }
    return standardNumber(tokens);
  }

  function numberAfter(text,anchors){
    const tokens=clean(text).split(' ');
    for(let i=0;i<tokens.length;i++){
      if(!anchors.includes(tokens[i]))continue;
      const result=spokenNumber(tokens.slice(i+1));
      if(result&&Number.isFinite(result.value))return result.value;
    }
    return null;
  }

  const LB_UNITS=['pound','pounds','lb','lbs'];
  const KG_UNITS=['kilo','kilos','kilogram','kilograms','kg','kgs'];
  const KG_TO_LB=2.20462;
  const JOINERS=new Set(['and','point']);
  // Words that mean the number in front of them is a different field, not a load.
  const FIELD_FOLLOWERS=new Set(['rir','rep','reps','repetition','repetitions','in']);

  const isDigitWord=t=>/^\d$/.test(t)||(SMALL[t]>=0&&SMALL[t]<=9);
  const digitValue=t=>/^\d$/.test(t)?t:String(SMALL[t]);

  function parseWhole(parts){
    if(!parts.length)return null;
    // "two two five" is how a recognizer commonly renders 225; summing those words gives 9.
    if(parts.length>=2&&parts.every(isDigitWord))return Number(parts.map(digitValue).join(''));
    const parsed=spokenNumber(parts);
    return parsed&&parsed.used===parts.length?parsed.value:null;
  }

  function parsePhrase(tokens){
    const parts=tokens.filter(t=>t!=='and');
    if(!parts.length)return null;
    const dot=parts.indexOf('point');
    if(dot<0)return parseWhole(parts);
    const whole=parseWhole(parts.slice(0,dot)),frac=parts.slice(dot+1);
    if(whole===null||!frac.length||!frac.every(isDigitWord))return null;
    return Number(String(whole)+'.'+frac.map(digitValue).join(''));
  }

  // Reads the WHOLE contiguous number phrase in front of the unit and parses it as one value.
  // Falling back to a shorter suffix when the full phrase fails silently turned "two hundred
  // and twenty five pounds" into 25, so a phrase that does not fully parse is rejected.
  function numberBeforeUnit(text,units){
    const tokens=clean(text).split(' ');
    for(let i=0;i<tokens.length;i++){
      if(!units.includes(tokens[i]))continue;
      let start=i;
      while(start>0&&(UNIT_WORDS.has(tokens[start-1])||/^\d+(?:\.\d+)?$/.test(tokens[start-1])||JOINERS.has(tokens[start-1])))start--;
      while(start<i&&JOINERS.has(tokens[start]))start++;
      const value=parsePhrase(tokens.slice(start,i));
      if(value!==null)return value;
    }
    return null;
  }

  // Anchored loads ("weight 185", "at 185") are only trusted when the number is not qualified by
  // another gym field: "8 reps at 2 rir" means two reps in reserve, not a 2 lb squat. `strict`
  // additionally requires the anchor to follow a gym word or nothing, so "rack it at 6" and
  // "I'm at 8 reps" do not become loads.
  function anchoredLoad(text,anchors,strict){
    const tokens=clean(text).split(' ');
    for(let i=0;i<tokens.length;i++){
      if(!anchors.includes(tokens[i]))continue;
      const before=tokens[i-1];
      if(strict&&i>0&&!/^\d+(?:\.\d+)?$/.test(before)&&!FIELD_FOLLOWERS.has(before)&&!UNIT_WORDS.has(before))continue;
      const result=spokenNumber(tokens.slice(i+1));
      if(!result||!Number.isFinite(result.value))continue;
      const follower=tokens[i+1+result.used];
      if(FIELD_FOLLOWERS.has(follower))continue;
      if(KG_UNITS.includes(follower))return result.value*KG_TO_LB;
      return result.value;
    }
    return null;
  }

  function clampInt(value,min,max){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?Math.round(n):null;
  }
  function clampLoad(value){
    if(value===null||value===undefined||value==='')return null;
    const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=2000?Math.round(n*2)/2:null;
  }

  function parseCommand(transcript){
    const text=clean(transcript);
    const command={text,weight:null,reps:null,rir:null,complete:false,next:false,previous:false,relock:false,stopVoice:false,bodyweight:false};
    if(!text)return command;

    command.stopVoice=/\b(?:stop|disable|turn off) (?:voice|listening|microphone|mic)\b/.test(text);
    command.relock=/\b(?:re ?lock|lock on|track me again)\b/.test(text);
    command.next=/\b(?:next exercise|move on|next movement)\b/.test(text);
    command.previous=/\b(?:previous exercise|last exercise|go back)\b/.test(text);
    command.complete=/\b(?:set (?:is )?(?:done|complete|finished)|done with (?:the )?set|finish (?:the )?set|complete (?:the )?set|finished (?:the )?set|thats it|that is it)\b/.test(text);
    command.bodyweight=/\b(?:body ?weight|no weight)\b/.test(text);

    let weight=numberBeforeUnit(text,LB_UNITS);
    // Kilograms were previously logged as pounds, so 100 kg became a 100 lb set.
    if(weight===null){const kg=numberBeforeUnit(text,KG_UNITS);if(kg!==null)weight=kg*KG_TO_LB}
    if(weight===null)weight=anchoredLoad(text,['weight','load','using','used'],false);
    if(weight===null)weight=anchoredLoad(text,['at'],true);
    command.weight=clampLoad(weight);

    let reps=numberBeforeUnit(text,['rep','reps','repetition','repetitions']);
    if(reps===null)reps=numberAfter(text,['reps','rep']);
    const repWords=(text.match(/\breps?\b/g)||[]).length;
    if(repWords===1&&/\breps? in reserve\b/.test(text))reps=null;
    command.reps=clampInt(reps,1,100);

    let rir=numberAfter(text,['rir']);
    // "8 reps at 2 rir" puts the number before the field word, which nothing used to read.
    if(rir===null)rir=numberBeforeUnit(text,['rir']);
    if(rir===null){
      const tokens=text.split(' ');
      for(let i=0;i<tokens.length-2&&rir===null;i++){
        if(!/^reps?$/.test(tokens[i])||tokens[i+1]!=='in'||tokens[i+2]!=='reserve')continue;
        for(let start=Math.max(0,i-4);start<i;start++){
          const slice=tokens.slice(start,i);if(!slice.every(t=>UNIT_WORDS.has(t)||/^\d+$/.test(t)))continue;
          const parsed=spokenNumber(slice);if(parsed&&parsed.used===slice.length)rir=parsed.value;
        }
      }
      if(rir===null){const match=text.match(/\b([0-5])\s+in reserve\b/);if(match)rir=Number(match[1]);}
    }
    command.rir=clampInt(rir,0,5);

    // "185 for 8" is useful when the recognizer omits units. Only accept this very specific
    // two-number construction; a lone bare number remains ambiguous and is intentionally ignored.
    const pair=text.match(/\b(\d+(?:\.\d+)?)\s+(?:for|by|x)\s+(\d{1,2})\b/);
    if(pair){if(command.weight===null)command.weight=clampLoad(pair[1]);if(command.reps===null)command.reps=clampInt(pair[2],1,100)}

    return command;
  }

  function summary(command){
    const bits=[];
    if(command.bodyweight)bits.push('bodyweight');else if(command.weight!==null)bits.push(`${command.weight} lb`);
    if(command.reps!==null)bits.push(`${command.reps} reps`);
    if(command.rir!==null)bits.push(`RIR ${command.rir}`);
    if(command.complete)bits.push('finish set');
    if(command.next)bits.push('next exercise');
    if(command.previous)bits.push('previous exercise');
    if(command.relock)bits.push('re-lock');
    if(command.stopVoice)bits.push('voice off');
    return bits.join(' · ');
  }

  const api={clean,spokenNumber,parseCommand,summary};
  if(typeof window!=='undefined')window.IronSixWorkoutVoice=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
