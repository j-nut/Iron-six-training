const {test}=require('node:test');
const assert=require('node:assert/strict');
const voice=require('../workout-voice.js');

test('parses ordinary and spoken-shorthand loads',()=>{
  assert.equal(voice.parseCommand('185 pounds').weight,185);
  assert.equal(voice.parseCommand('one eighty five pounds').weight,185);
  assert.equal(voice.parseCommand('four oh five pounds').weight,405);
  assert.equal(voice.parseCommand('weight two twenty five').weight,225);
  assert.equal(voice.parseCommand('used 135').weight,135);
});

test('a bare number is deliberately not guessed as weight or reps',()=>{
  const command=voice.parseCommand('12');
  assert.equal(command.weight,null);assert.equal(command.reps,null);assert.equal(command.rir,null);
});

test('parses compact weight-for-reps gym shorthand',()=>{
  const command=voice.parseCommand('185 for 8');
  assert.equal(command.weight,185);assert.equal(command.reps,8);
});

test('separates performed reps from reps in reserve',()=>{
  let command=voice.parseCommand('two reps in reserve');
  assert.equal(command.reps,null);assert.equal(command.rir,2);
  command=voice.parseCommand('8 reps two reps in reserve');
  assert.equal(command.reps,8);assert.equal(command.rir,2);
});

test('parses hands-free workout controls without inventing values',()=>{
  assert.equal(voice.parseCommand('set done').complete,true);
  assert.equal(voice.parseCommand('move on').next,true);
  assert.equal(voice.parseCommand('previous exercise').previous,true);
  assert.equal(voice.parseCommand('re-lock').relock,true);
  assert.equal(voice.parseCommand('stop voice').stopVoice,true);
  assert.equal(voice.parseCommand('bodyweight').bodyweight,true);
});

test('rejects unreasonable values rather than writing them to a workout',()=>{
  assert.equal(voice.parseCommand('3000 pounds').weight,null);
  assert.equal(voice.parseCommand('101 reps').reps,null);
  assert.equal(voice.parseCommand('RIR 8').rir,null);
});
