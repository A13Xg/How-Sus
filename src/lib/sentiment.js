/**
 * sentiment.js — AFINN-based emotional tone scorer (client-side, no API).
 *
 * Returns { score, normalizedScore, label, intensity, positiveWords, negativeWords }
 * score:           raw sum of matched word values (-n to +n)
 * normalizedScore: clamped to -5..+5
 * label:           textual verdict
 * intensity:       0-100 strength irrespective of direction
 * positiveWords / negativeWords: matched words for display
 */

// Compact AFINN-165 subset — most impactful 300 words
const AFINN = {
  abandon:-2,abandoned:-2,abhor:-3,abominable:-3,abominably:-3,abuse:-3,
  abusive:-3,ache:-2,aching:-2,adamant:2,adequate:1,admire:2,admired:2,
  adore:3,advantageous:2,affection:3,affirm:2,afraid:-2,aggravate:-2,
  aggression:-2,aggressive:-2,agony:-3,alarm:-2,alarming:-2,alienate:-2,
  amazing:4,ambiguous:-1,anger:-3,angry:-3,anguish:-3,annoy:-2,annoying:-2,
  anxious:-2,appalling:-3,appreciate:2,approval:2,arrogant:-2,astonish:2,
  atrocious:-3,authentic:2,awesome:4,awful:-3,bad:-3,badly:-3,beautify:2,
  beautiful:3,benefit:2,benevolent:2,betray:-3,bias:-2,biased:-2,blame:-2,
  bliss:3,block:-1,bold:2,boring:-2,brave:2,break:-1,brilliant:3,broken:-2,
  calm:2,capable:2,care:2,catastrophe:-3,certain:1,champion:3,chaotic:-2,
  cheerful:2,cheat:-3,clumsy:-2,coerce:-2,collapse:-2,comfort:2,commendable:3,
  compassion:3,competent:2,complain:-2,complex:-1,concern:-1,confuse:-2,
  corrupt:-3,courage:2,creative:2,crime:-3,crisis:-2,critical:-2,cruel:-3,
  danger:-2,dangerous:-3,deadly:-3,deceive:-3,deceptive:-3,defeat:-2,
  degrade:-3,destroy:-3,devastate:-3,dirty:-2,disaster:-3,discourage:-2,
  disgrace:-3,dishonest:-3,distrust:-2,disturbing:-2,dreadful:-3,dynamic:2,
  effective:2,efficient:2,empower:2,encourage:2,enemy:-2,error:-2,evil:-3,
  exceptional:3,exploit:-3,expose:-2,extraordinary:3,fail:-2,failure:-3,
  fake:-3,false:-3,falsehood:-3,fantastic:4,fear:-2,fearful:-2,flawed:-2,
  flourish:3,forceful:2,forgive:2,fraud:-3,freedom:2,frustrate:-2,gain:2,
  genuine:2,glorify:2,good:3,graceful:2,grateful:2,great:3,greed:-2,grief:-2,
  harm:-3,hate:-3,heal:2,helpful:2,honest:2,hope:2,horrible:-3,hostile:-2,
  humble:2,hurt:-2,ignorant:-2,illegal:-3,impressive:3,incredible:3,injustice:-3,
  innovative:3,inspire:3,intimidate:-2,invalid:-2,irresponsible:-2,joyful:3,
  justice:2,kind:2,knowledge:1,lack:-1,leadership:2,lie:-3,lied:-3,lies:-3,
  logical:1,love:3,loyal:2,magnificent:3,manipulate:-3,marvelous:3,meaningful:2,
  mislead:-3,misled:-3,mistake:-2,misleading:-3,mock:-2,outstanding:4,
  overcome:2,peaceful:3,powerful:2,precise:1,productive:2,profound:2,progress:2,
  protect:2,proud:2,quality:2,real:1,reliable:2,remarkable:3,resilient:2,
  respect:2,responsible:2,reward:2,safe:2,scandal:-3,secure:2,shame:-2,
  shocking:-2,sickening:-3,sincere:2,skilled:2,smart:2,sorrow:-2,strong:2,
  struggle:-2,suffering:-3,support:2,suspicious:-2,terrifying:-3,thankful:2,
  threat:-2,trustworthy:2,truth:2,uncertain:-1,unfair:-2,unjust:-2,
  unnecessary:-1,useful:2,valid:2,valuable:2,victory:3,violent:-3,vision:2,
  warn:-1,warning:-1,weak:-2,win:2,wisdom:2,wonderful:3,wrong:-3,
};

const LABEL_MAP = [
  { min: 4,   label: 'Very Positive' },
  { min: 2,   label: 'Positive' },
  { min: 0.5, label: 'Slightly Positive' },
  { min: -0.5,label: 'Neutral' },
  { min: -2,  label: 'Slightly Negative' },
  { min: -4,  label: 'Negative' },
  { min: -Infinity, label: 'Very Negative' },
];

export function analyzeSentiment(text) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let raw = 0;
  const positiveWords = [];
  const negativeWords = [];

  for (const token of tokens) {
    const clean = token.replace(/^[-']+|[-']+$/g, '');
    if (AFINN[clean] !== undefined) {
      const val = AFINN[clean];
      raw += val;
      if (val > 0) positiveWords.push(clean);
      else negativeWords.push(clean);
    }
  }

  const wordCount = Math.max(tokens.length, 1);
  const normalizedScore = Math.max(-5, Math.min(5, raw / Math.sqrt(wordCount)));
  const label = LABEL_MAP.find((l) => normalizedScore >= l.min)?.label ?? 'Neutral';
  const intensity = Math.round(Math.min(100, (Math.abs(raw) / (wordCount * 0.1)) * 100));

  return {
    score: raw,
    normalizedScore: parseFloat(normalizedScore.toFixed(2)),
    label,
    intensity: Math.min(100, intensity),
    positiveWords: [...new Set(positiveWords)].slice(0, 8),
    negativeWords: [...new Set(negativeWords)].slice(0, 8),
  };
}
