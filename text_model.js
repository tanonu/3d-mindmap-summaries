(function (root) {
'use strict';
const { minWords: MIN_WORDS, maxWords: MAX_WORDS } = window.NETWORK_CONFIG;

const EN_STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below ' +
 'between both but by can could did do does doing down during each few for from further had has have having he her here hers ' +
 'herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or ' +
 'other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these ' +
 'they this those through to too under until up us very was we were what when where which while who whom why will with would you ' +
 'your yours yourself yourselves said says say however although though yet still even ever never always often usually already since ' +
 'upon whether within without among around across along either neither one two three four five first second third new many much less ' +
 'least several every another others like likely made make makes making get gets got getting went go goes going come came comes took ' +
 'take takes taken give gave given use used uses using want wanted wants need needs needed seem seems seemed become became becomes ' +
 'thing things way ways lot lots well back later early late next last long great good better best bad big small high low part parts ' +
 'really quite rather almost began begin begins tried try tries may might often typically commonly generally frequently sometimes various several certain taught told found felt kept left held brought built day days week weeks month months year years time times hour hours minute minutes moment today yesterday tomorrow').split(/\s+/));
const DE_STOP = new Set(('der die das den dem des ein eine einer einem einen eines und oder aber auch als am an auf aus bei bis durch für ' +
 'gegen im in ins mit nach nicht noch nur ohne um über unter von vor zu zum zur zwischen ist sind war waren wird werden wurde wurden hat ' +
 'haben hatte hatten kann können konnte sein seine seiner seinem seinen ihr ihre ihrer ihren es er sie wir ich du man sich dass daß wenn ' +
 'weil dann dort hier da so wie was wer wo wann warum sehr mehr viel viele schon immer wieder doch denn während dieser diese dieses diesen ' +
 'jede jeder jedes alle allen anderen andere mehrere einige etwa bereits ganz gibt gab geben machen macht machte sagte sagt neue neuen ' +
 'neuer neues erste ersten erster später früher dabei damit dafür davon daher deshalb jedoch sowie sowohl zudem außerdem').split(/\s+/));
const CONN = new Set(['of', 'de', 'van', 'von', 'der', 'du', 'da', 'di', 'la', 'le', 'del']);
const MONTHS = new Set('january february march april may june july august september october november december januar februar märz mai juni juli oktober dezember'.split(' '));
const ROLE = new Set(('astronaut astronauts engineer engineers scientist scientists researcher researchers president professor prof dr mr mrs ms sir ' +
 'minister chancellor ceo director senator general king queen prince princess company team teams staff employees users people mayor präsident präsidenten präsidentin kanzler kanzlerin bundeskanzler bundeskanzlerin ministerin direktor direktorin professorin herr frau').split(' '));
const GENERIC = new Set('thing stuff something anything everything'.split(' '));
const PERSON = new Set(('father mother daughter son parent parents dad mom brother sister man men woman women boy girl wife husband friend ' +
  'friends narrator people person someone guy child children kid kids').split(' '));

// Stem of one word, used to compare node names (English rules).
const stemWord = w => stem(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), 'en');
const wordStems = label => label.split(/\s+/).map(stemWord).filter(Boolean);
// Remove words that already appear in another node name, then tidy the ends ("Fear of looking foolish" -> "Fear").
// Returns null when nothing meaningful is left.
function dedupeLabel(label, avoid) {
  const words = label.split(/\s+/);
  const clash = w => avoid.has(stemWord(w));
  if (!words.some(clash)) return label;
  const kept = words.filter(w => !clash(w));
  while (kept.length && EN_STOP.has(kept[kept.length - 1].toLowerCase())) kept.pop();
  while (kept.length && EN_STOP.has(kept[0].toLowerCase())) kept.shift();
  return kept.length ? cap1(kept.join(' ')) : null;
}
function stem(w, lang) {
  if (lang === 'de' || w.length < 4) return w;
  if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ch|sh|ss|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (/[^s]s$/.test(w) && w.length > 3) w = w.slice(0, -1);
  if (w.length > 6 && /ing$/.test(w)) w = w.slice(0, -3);
  else if (w.length > 5 && /ed$/.test(w)) w = w.slice(0, -2);
  if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
  return w;
}
// words that signal an "event" (English: compared after stemming; German: compound-word match)
const EVENT_STEMS = new Set(('launch war meeting election crisis merger release conference attack agreement collapse protest summit landing ' +
 'revolution announcement acquisition accident discovery treaty strike festival explosion investigation crash outbreak disaster founding trial ' +
 'verdict vote speech ceremony tournament expedition rescue splashdown reform scandal recall bankruptcy incident negotiation').split(' ').map(w => stem(w, 'en')));
const EVENT_DE = 'krieg wahl krise gipfel streik unfall landung konferenz abkommen revolution verhandlung angriff unglück'.split(' ');

/* Lesson cues: a sentence that states a takeaway. The words after the cue become the node label. */
const LESSON_EN = /\b(?:taught(?:\s+\w+){0,3}?\s+that|learn(?:ed|t)\s+(?:that|to)|lessons?(?:\s+\w+){0,2}?\s+(?:is|was|are|were)(?:\s+that)?|takeaways?(?:\s+(?:is|was|are|were))?(?:\s+that)?|should|must|ought\s+to|needs?\s+to|needed\s+to|important\s+to|realiz(?:e|ed|es)\s+that|conclud(?:e|ed|es)\s+that)\b/i;
const LESSON_DE = /\b(?:gelernt(?:,?\s+dass)?|lektion(?:\s+(?:war|ist))?(?:,?\s+dass)?|sollte[n]?|muss|müssen|wichtig(?:\s+(?:ist|war))?(?:,?\s+dass)?)\b/i;

/* Meta lexicon: abstract ideas a text can be "about". Matching words (stems) are counted; the best-scoring idea wins.
   Stems of 5+ letters match as prefixes, shorter ones as whole words (plus simple endings). English only. */
const META = [
 { label: 'Pretending to avoid looking foolish', short: "Pretense", desc: "Pretending to agree or to see things, so as not to look foolish or incompetent.",
   reframe: [['@self-fear', 'Fear'],
             ['townsfolk|crowd|people|everyone|courtier|lord|official|minister|procession|chief|whole|public|compliment|praise|admire|appear', 'Social pressure']],
   strong: ["pretend", "pretens", "foolish", "fool", "humiliat", "ridicul"], weak: ["stupid", "incompetent", "inept", "appear", "reputation", "laugh", "ashamed", "embarrass"] },
 { label: 'Facing adversity with the right attitude', short: "Endurance", desc: "The inner attitude we bring to hardship decides whether it breaks or strengthens us.", strong: ['adversit','resilien','attitude','hardship','perseveren','endur'], weak: ['struggl','problem','respond','react','tired','unrelenting'] },
 { label: 'Lying to keep the peace', short: "Appeasement", desc: "Telling comforting falsehoods to avoid conflict and keep things calm.", strong: ['lie','lies','lied','lying','dishonest','deceit','liar'], weak: ['silence','silent','peace','harmon','conceal','secret','hide'] },
 { label: 'Saying what people want to hear', short: "Flattery", desc: "Telling people what pleases them instead of what is true.", strong: ['flatter','compliment','praise','applaud'], weak: ['admire','please','agree','approv','cheer'] },
 { label: 'Authority and fear of speaking up', short: "Silence", desc: "Fear of those in power keeps honest voices from being heard.", strong: ["authorit", "obey", "obedien", "punish", "frighten", "intimidat"], weak: ["emperor", "king", "queen", "ruler", "boss", "command", "order", "officials", "minister", "superior", "fear", "afraid"] },
 { label: 'Vanity and self-deception', short: "Vanity", desc: "Caring more about appearance and praise than about reality.", strong: ['vain','vanity','pride','proud','delus','narciss','obsess'], weak: ['fancy','lavish','magnificent','mirror','beaut','luxur','ego'] },
 { label: 'Truth spoken by the innocent', short: "Innocence", desc: "Honest truths are often said first by those who fear no consequences.", strong: ["truth", "honest", "naive", "innocen", "blurt"], weak: ["realiz", "observation", "reveal"] },
 { label: 'Deception preys on gullibility', short: "Gullibility", desc: "Those who want to believe are easy targets for tricksters.", strong: ['deceiv','decept','fraud','conmen','conman','scam','swindl','cheat','trick','duped','gullible','fake'], weak: ['mime','invisible','sham'] },
 { label: 'Social pressure and conformity', short: "Conformity", desc: "People follow the crowd rather than risk looking different or wrong.", strong: ['conform','pressure','peer','majorit','crowd'], weak: ['everyone','townsfolk','society','follow','public','whole'] },
 { label: 'Pride that blocks admitting mistakes', short: "Pride", desc: "Pride stops people from admitting errors, and so from correcting them.", strong: ['admit','stubborn','mistake','error','unwilling','regret'], weak: ['continue','persist','blame','excuse','deny'] },
 { label: 'Trust and teamwork', strong: ["teamwork", "cooperat", "collaborat"], weak: ["team", "together", "communicat", "support", "trust"] },
 { label: 'Learning from failure', short: "Learning", desc: "Mistakes reveal what needs to change.", strong: ['failure','fail','lesson','investigat','redesign'], weak: ['improv','learn','recover','backup','safety','mistake'] },
 { label: 'Resilience in a crisis', short: "Resilience", desc: "Some people recover and adapt under pressure when others collapse.", strong: ['crisis','rescue','surviv','emergency','danger','disaster'], weak: ['alive','risk','threat','tense'] },
 { label: 'Improvisation solves problems', short: "Improvisation", desc: "Making do with what is at hand can solve problems that plans cannot.", strong: ['improvis','invent','adapt','creativ','solv'], weak: ['tape','cardboard','workaround','fix'] },
 { label: 'Conflict and its costs', short: "Conflict", desc: "Fights often cost more than they seem to win.", strong: ["war", "battle", "conflict", "fight", "enem", "army", "weapon"], weak: ["peace", "soldier", "troop", "defend", "invasion", "attack"] },
 { label: 'Competition and profit', short: "Competition", desc: "Rivals push each other to improve, and the market rewards the best.", strong: ['merger','profit','revenue','market','competit','shareholder','investor'], weak: ['price','deal','company','cost','sales'] },
 { label: 'Justice and accountability', short: "Accountability", desc: "Those who act must answer for their actions.", strong: ["justice", "guilty", "crime", "accountab", "lawsuit"], weak: ["judge", "police", "rights", "investigat", "regulat", "trial"] },
 { label: 'Power and responsibility', short: "Responsibility", desc: "Power carries a duty to use it for others.", strong: ["responsib", "corrupt", "greed"], weak: ["government", "leader", "president", "election", "polic", "power"] },
 { label: 'Technology reshapes society', short: "Technology", desc: "New tools change what people do, value and expect.", strong: ['technolog','digital','software','algorithm','internet','artificial'], weak: ['online','platform','device','computer','innovat','data'] },
 { label: 'Climate and sustainability', strong: ['climate','emission','carbon','sustainab','renewable','environment','warming'], weak: ['energy','gas','oil','pollut','green'] },
 { label: 'Love and belonging', strong: ['love','loving','marriage','relationship','friendship','heart'], weak: ['family','friend','partner','lonely'] },
 { label: 'Loss and remembrance', short: "Mourning", desc: "Loss is felt deeply, and remembering keeps the lost person present.", strong: ['death','died','grief','mourn','funeral','loss'], weak: ['memory','remember','widow'] },
 { label: 'Journey and transformation', short: "Transformation", desc: "Passing through hard stages can change who we are.", strong: ["journey", "voyage"], weak: ["travel", "return", "change", "home", "path", "arrive", "transform", "quest"] },
 { label: 'Knowledge and education', strong: ["educat", "universit"], weak: ["learn", "study", "knowledge", "research", "school", "teacher", "student"] },
 { label: 'Health and care', short: "Care", desc: "Looking after body and mind as part of living well.", penalty: 0.6, strong: ["disease", "medic"], weak: ["doctor", "care", "treat", "symptom", "health", "patient", "hospital", "therapy"] },
 { label: 'Freedom and control', short: "Freedom", desc: "Freedom and control pull against each other in every life.", strong: ['freedom','liberty','oppress','surveillance','censor'], weak: ['rights','control','restrict'] },
 { label: "Honesty builds lasting trust", strong: ["honest", "truthful", "integrity", "candor", "candid"], weak: ["sincer", "reliab", "transparen"] },
 { label: "Patience outlasts haste", short: "Patience", desc: "Steady waiting and effort achieve more than rushing.", strong: ["patien", "hasty", "hurry", "impatien", "rush"], weak: ["wait", "slow", "persever"] },
 { label: "Pride comes before a fall", short: "Hubris", desc: "Excessive self-confidence leads to downfall.", strong: ["arrogan", "hubris", "conceit", "boast"], weak: ["overconfid", "smug", "superior"] },
 { label: "Humility opens doors", strong: ["humble", "modest", "humil"], weak: ["admit", "apolog", "listen"] },
 { label: "Gratitude multiplies joy", short: "Gratitude", desc: "Noticing what one has increases happiness.", strong: ["grateful", "thankful", "gratitude", "appreciat"], weak: ["thank", "blessing", "cherish"] },
 { label: "Small habits compound over time", short: "Habit", desc: "Small repeated actions add up to large results.", strong: ["habit", "routine", "daily", "consisten"], weak: ["practice", "repeat", "steady"] },
 { label: "Greed breeds its own ruin", short: "Greed", desc: "Wanting more always costs more than it gives.", strong: ["greed", "greedy", "avarice", "covet"], weak: ["grasp", "hoard", "cling"] },
 { label: "Envy corrodes the envious", short: "Envy", desc: "Comparison with others harms the one who feels it most.", strong: ["envy", "envious", "jealous", "jealousy"], weak: ["resent", "bitter", "compar"] },
 { label: "Fear distorts judgment", strong: ["panic", "dread", "terror", "anxiety"], weak: ["worry", "scared", "nervous"] },
 { label: "Kindness disarms enemies", short: "Kindness", desc: "Gentleness can change hostile people.", strong: ["kindness", "kind"], weak: ["mercy", "forgiv", "generous", "gentle", "gentleness"] },
 { label: "Compassion returns to the giver", short: "Compassion", desc: "Caring for others comes back to the one who cares.", strong: ["compassion", "empath", "sympath", "charity"], weak: ["help", "care", "suffer"] },
 { label: "Wisdom listens before speaking", strong: ["listen", "attentive", "wisdom", "wise"], weak: ["hear", "consider", "reflect"] },
 { label: "Cruel words wound for years", strong: ["insult", "cruel", "slander", "mock"], weak: ["harsh", "rude", "hurt"] },
 { label: "Revenge poisons the avenger", short: "Revenge", desc: "Seeking retribution harms the person who seeks it.", strong: ["revenge", "vengeance", "grudge", "avenge"], weak: ["retali", "spite", "hatred"] },
 { label: "Forgiveness frees the forgiver", short: "Forgiveness", desc: "Letting go of a grudge releases the one who holds it.", strong: ["forgiv", "pardon", "reconcil"], weak: ["regret", "apolog", "repent"] },
 { label: "Courage is acting despite fear", short: "Courage", desc: "Bravery means acting even when afraid.", strong: ["courage", "brave", "bravery", "heroic", "fearless", "afraid"], weak: ["dare", "bold", "stand"] },
 { label: "Loyalty is proven in hardship", strong: ["loyal", "loyalty", "faithful", "fidelity"], weak: ["oath", "devot", "allegian"] },
 { label: "Betrayal grows from broken trust", strong: ["betray", "traitor", "backstab", "treason"], weak: ["disloyal", "abandon", "deserted"] },
 { label: "Contentment is a form of wealth", strong: ["contentment", "sufficien"], weak: ["simple", "plain", "modest", "content", "enough"] },
 { label: "Character shows under pressure", strong: ["character", "unmask", "exposed"], weak: ["test", "genuine", "true"] },
 { label: "Adversity forges strength", short: "Adversity", desc: "Hardship builds a strength that comfort cannot.", strong: ["adversit", "hardship", "ordeal", "trial", "suffering"], weak: ["endur", "struggl", "burden"] },
 { label: "Everything changes, nothing stays", strong: ["impermanen", "transient", "fleeting", "passing"], weak: ["flow", "decay", "change"] },
 { label: "Life is short: choose wisely", strong: ["mortal", "mortality", "precious", "finite"], weak: ["choose", "priorit", "value"] },
 { label: "Chasing approval costs freedom", short: "Approval", desc: "Seeking approval from others limits what one is free to do.", strong: ["approval", "validation", "applause", "popularity"], weak: ["praise", "seek", "fame"] },
 { label: "Authenticity beats appearances", short: "Authenticity", desc: "Being genuine is worth more than looking impressive.", strong: ["facade", "mask", "appearance", "image", "looks"], weak: ["authentic", "pose", "show"] },
 { label: "Simplicity reveals the truth", short: "Simplicity", desc: "Stripping things back shows what matters.", strong: ["simplicity", "simple", "plain"], weak: ["clarity", "obvious", "direct"] },
 { label: "The mind builds its own prison", strong: ["prison", "trapped", "captive", "cage"], weak: ["mind", "belief", "thought"] },
 { label: "Beliefs shape what we see", strong: ["belief", "believ", "convict", "dogma"], weak: ["think", "opinion", "faith"] },
 { label: "Perspective changes everything", strong: ["perspective", "viewpoint", "outlook", "frame", "vision"], weak: ["angle", "view", "see"] },
 { label: "Absolute power corrupts", strong: ["tyrant", "tyranny", "despot", "dictator"], weak: ["absolute", "ruler", "oppress"] },
 { label: "Hope sustains through darkness", short: "Hope", desc: "Expecting better days keeps people going through hard times.", strong: ["hope", "hopeful", "optimis"], weak: ["light", "dream", "faith"] },
 { label: "Despair blinds us to options", short: "Despair", desc: "Hopelessness hides the choices that remain.", strong: ["despair", "hopeless", "desperat"], weak: ["surrender", "lost", "giveup"] },
 { label: "Healthy doubt sharpens wisdom", strong: ["doubt", "skeptic", "sceptic"], weak: ["uncertain", "inquir", "wonder", "question"] },
 { label: "Curiosity opens new worlds", short: "Curiosity", desc: "Asking questions opens paths that certainty closes.", strong: ["curious", "curiosity", "explor"], weak: ["discover", "ask", "learn"] },
 { label: "Generosity enriches the giver", strong: ["generos", "donat", "sharing"], weak: ["share", "gift", "altruis"] },
 { label: "Hard work honours talent", strong: ["diligen", "industr", "toil", "effort"], weak: ["labor", "labour", "persist"] },
 { label: "Talent without character falls short", strong: ["talent", "gifted", "prodigy"], weak: ["skill", "ability", "genius"] },
 { label: "Respect must be earned", short: "Respect", desc: "Esteem comes from conduct, not from position.", strong: ["respect", "dignity", "honor", "honour"], weak: ["esteem", "status", "recogni"] },
 { label: "Conscience guides the just", strong: ["conscience", "guilt", "remorse", "shame"], weak: ["moral", "ethic", "righteous"] },
 { label: "Prejudice blinds judgment", strong: ["prejudice", "bigot", "stereotyp"], weak: ["judge", "label", "suspicion"] },
 { label: "Injustice corrodes a society", strong: ["injustice", "unjust", "unfair", "bias"], weak: ["discriminat", "unequal", "outcast"] },
 { label: "Crowds can lead people astray", strong: ["mob", "stampede", "herd"], weak: ["follow", "majority", "conform"] },
 { label: "Self-control is freedom", strong: ["self-control", "discipline", "restraint"], weak: ["patience", "calm", "composure"] },
 { label: "Silence can speak volumes", strong: ["silent", "hush", "mute"], weak: ["quiet", "whisper", "pause"] },
 { label: "Anger clouds the mind", short: "Anger", desc: "Rage distorts judgment and memory.", strong: ["anger", "angry", "rage", "wrath"], weak: ["temper", "fury", "irritat"] },
 { label: "Ego must yield to the whole", strong: ["ego", "selfish", "selfless", "self-interest"], weak: ["individual", "cooperat", "self"] },
 { label: "Unity makes the many strong", strong: ["unity", "united", "solidarit"], weak: ["together", "alliance", "community"] },
 { label: "Division weakens everyone", strong: ["divide", "division", "factional", "split"], weak: ["rival", "faction", "feud"] },
 { label: "Feuds drain everyone involved", strong: ["feud", "quarrel", "vendetta"], weak: ["dispute", "clash", "argument"] },
 { label: "Reputation is slow to build", strong: ["reputation", "credibility", "trustworth"], weak: ["name", "brand", "repute"] },
 { label: "Opportunity favours the prepared", strong: ["prepar", "opportun", "readiness"], weak: ["chance", "timing", "ready"] },
 { label: "Luck favours the bold", strong: ["luck", "fortune", "gamble", "wager"], weak: ["risk", "bet", "daring"] },
 { label: "Sunk costs mislead decisions", strong: ["sunk", "sunken", "escalat"], weak: ["invest", "already", "spent"] },
 { label: "Moderation is a virtue", strong: ["moderat", "balance", "temperance"], weak: ["measure", "restrain", "middle"] },
 { label: "Flatterers serve their own ends", strong: ["flatter", "sycophant", "toady", "yes-man"], weak: ["courtier", "favour", "favor"] },
 { label: "Gossip reveals the gossiper", strong: ["gossip", "rumour", "rumor", "hearsay"], weak: ["spread", "talk", "whisper"] },
 { label: "Wealth cannot buy happiness", strong: ["wealth", "riches", "luxury", "extravagan"], weak: ["money", "possession", "fortune"] },
 { label: "Excess leads to emptiness", strong: ["excess", "indulg", "gluttony", "binge"], weak: ["lavish", "more", "hoard"] },
 { label: "Nature teaches patience", strong: ["season", "harvest", "growth", "seed"], weak: ["garden", "tree", "nature"] },
 { label: "Storms pass, so endure", strong: ["storm", "tempest", "flood"], weak: ["calm", "wave", "weather"] },
 { label: "Light reveals what darkness hides", strong: ["darkness", "shadow", "hidden"], weak: ["light", "dim", "obscur"] },
 { label: "Every ending begins something new", strong: ["ending", "rebirth", "renewal"], weak: ["begin", "restart", "new"] },
 { label: "Presence matters more than plans", strong: ["mindful", "presence", "aware"], weak: ["moment", "now", "attention"] },
 { label: "Solitude yields wisdom", strong: ["solitude", "hermit"], weak: ["withdraw", "retreat", "quiet", "alone"] },
 { label: "Good company shapes character", strong: ["companion", "peers", "associate"], weak: ["influence", "example", "imitat"] },
 { label: "Imitation without understanding fails", strong: ["imitat", "copy", "mimic"], weak: ["follow", "model", "example"] },
 { label: "Ambition needs a compass", strong: ["ambition", "ambitious", "aspire"], weak: ["goal", "dream", "reach"] },
 { label: "Impulse without thought backfires", strong: ["impulsive", "impulse", "reckless"], weak: ["react", "rash", "hot"] },
 { label: "Duty comes before comfort", strong: ["duty", "obligation", "dutiful", "devotion"], weak: ["service", "sacrific", "honor"] },
 { label: "Sacrifice reveals priorities", strong: ["sacrific", "renounce", "forgoing"], weak: ["cost", "price", "give"] },
 { label: "Process matters more than destination", strong: ["destination", "arrival", "endpoint"], weak: ["journey", "path", "road"] },
 { label: "Wise people know their limits", strong: ["ignorance", "ignorant", "unknowing"], weak: ["knowledge", "know", "limit"] },
 { label: "Reciprocity sustains relationships", strong: ["reciproc", "mutual", "exchange"], weak: ["return", "repay", "owe"] },
 { label: "Tolerance enriches a community", strong: ["tolerance", "tolerant", "open-minded"], weak: ["diverse", "accept", "welcome"] },
 { label: "Empathy sees through others' eyes", strong: ["empathy", "empathize", "empathise"], weak: ["understand", "perceive", "feel"] },
 { label: "Hospitality reveals character", strong: ["hospitality", "hospitable", "host"], weak: ["guest", "welcome", "shelter"] },
 { label: "Laughter lightens burdens", strong: ["laughter", "humor", "humour", "joke"], weak: ["smile", "cheer", "playful"] },
 { label: "Stillness comes before right action", strong: ["stillness", "meditat", "contemplat"], weak: ["calm", "breath", "pause"] },
 { label: "Mentors shorten the path", strong: ["mentor", "apprentice", "guidance"], weak: ["teach", "disciple", "coach"] },
 { label: "Stewardship of what is entrusted", strong: ["entrust", "stewardship", "custodian", "trustee"], weak: ["guard", "care", "duty"] },
 { label: "Dignity of the poor and weak", strong: ["poverty", "destitute", "beggar"], weak: ["needy", "vulnerable", "weak"] },
 { label: "Greatness lies in service", strong: ["servant", "volunteer", "altruis"], weak: ["leader", "helper", "assist", "serve", "service"] },
 { label: "Lies unravel over time", strong: ["unravel", "exposure", "deception"], weak: ["secret", "cover", "hidden"] },
 { label: "Courage to speak against wrong", strong: ["dissent", "whistleblow", "protest"], weak: ["defy", "resist", "confront"] },
 { label: "Comfort can breed complacency", strong: ["complacen", "indolen", "complacency"], weak: ["ease", "lazy", "idle"] },
 { label: "Meaning outlasts pleasure", strong: ["meaning", "purpose", "fulfil"], weak: ["pleasure", "joy", "happy"] },
 { label: "Feints mislead the opponent", strong: ["feint", "decoy", "bait", "lure"], weak: ["distract", "trick", "mislead"] },
 { label: "Know the terrain before you move", strong: ["terrain", "geography", "battlefield"], weak: ["ground", "position", "environment"] },
 { label: "Choose your battles wisely", strong: ["battle", "skirmish", "campaign"], weak: ["war", "fight", "army"] },
 { label: "Your alternatives set your power", strong: ["leverage", "batna", "alternative"], weak: ["option", "bargain", "power"] },
 { label: "Strike where the enemy is unprepared", strong: ["ambush", "surprise", "sneak", "raid"], weak: ["unprepared", "flank", "outflank"] },
 { label: "Concentrate force on the decisive point", strong: ["concentrat", "decisive", "massed"], weak: ["focus", "force", "resource"] },
 { label: "Win without fighting if you can", strong: ["bloodless", "capitulat", "outwit"], weak: ["avoid", "outmaneuver", "surrender"] },
 { label: "Divide the opposition to conquer it", strong: ["subjugat", "conquer", "conquest"], weak: ["divide", "sow", "splinter"] },
 { label: "Build defences before the storm", strong: ["fortif", "defens", "safeguard", "contingen"], weak: ["prepare", "reserve", "backup"] },
 { label: "Diversify to reduce risk", strong: ["diversif", "portfolio", "hedge"], weak: ["spread", "variety", "risk"] },
 { label: "Compound returns reward patience", strong: ["compound", "interest", "accumulat"], weak: ["invest", "savings", "grow"] },
 { label: "Cut losses early", strong: ["losses", "write-off", "writeoff"], weak: ["cut", "quit", "abandon"] },
 { label: "Decide with incomplete information", strong: ["incomplete", "guesswork"], weak: ["estimate", "guess", "judgment", "uncertainty"] },
 { label: "Keep your promises", strong: ["promise", "pledge", "vow", "oath"], weak: ["commit", "deliver", "word"] },
 { label: "Under-promise and over-deliver", strong: ["overdeliver", "expectation", "exceed"], weak: ["deliver", "quality", "surpass"] },
 { label: "Start small, then scale", strong: ["prototype", "pilot", "incremental"], weak: ["small", "scale", "launch"] },
 { label: "Finish one task before the next", strong: ["multitask", "distract"], weak: ["focus", "deadline", "task", "interrupt"] },
 { label: "Do the hardest task first", strong: ["procrastinat", "postpone", "delay"], weak: ["chore", "todo", "overdue"] },
 { label: "Batch similar work together", strong: ["batch", "routine", "schedule"], weak: ["efficien", "organi", "planner"] },
 { label: "Rest is part of productivity", strong: ["burnout", "exhaust", "overwork"], weak: ["rest", "recover", "break"] },
 { label: "A few causes drive most results", strong: ["pareto", "leverage", "bottleneck"], weak: ["key", "most", "focus"] },
 { label: "Measure what truly matters", strong: ["metric", "measure", "kpi"], weak: ["track", "data", "progress"] },
 { label: "Feedback accelerates growth", strong: ["feedback", "critique", "review"], weak: ["improve", "input", "reflect"] },
 { label: "Listen closely to your customers", strong: ["customer", "audience"], weak: ["needs", "demand", "service", "client"] },
 { label: "Quality outlasts price", strong: ["craftsman", "craft", "durable"], weak: ["quality", "value", "price"] },
 { label: "Spending within means protects freedom", strong: ["overspend", "borrow", "debt"], weak: ["budget", "afford", "spend"] },
 { label: "Constraints spark invention", strong: ["constraint", "limitation", "scarcity"], weak: ["creativ", "resourceful", "workaround"] },
 { label: "Tradition holds hard-won wisdom", strong: ["tradition", "ancestor", "heritage", "custom"], weak: ["elder", "history", "old"] },
 { label: "Cleverness without ethics is dangerous", strong: ["clever", "cunning", "crafty", "sly"], weak: ["shrewd", "wit", "scheme"] },
 { label: "Plan the week, not just the hour", strong: ["roadmap", "agenda", "strategy"], weak: ["planning", "calendar", "week"] },
 { label: "Sharpen the tools before the work", strong: ["sharpen", "groundwork", "preparation"], weak: ["tool", "skill", "practice"] },
 { label: "Negotiate from strength, not fear", strong: ["negotiat", "bargain", "haggle"], weak: ["deal", "terms", "offer"] },
 { label: "First movers gain an edge", strong: ["pioneer", "first-mover", "trailblazer"], weak: ["early", "innovator", "lead"] },
 { label: "Focus on your core strength", strong: ["specialis", "niche", "expertise"], weak: ["core", "strength", "focus"] },
 { label: "Playing the long game", strong: ["longterm", "long-term", "endurance"], weak: ["patient", "decade", "legacy"] },
 { label: "Everything is connected", strong: ["interconnect", "interdepend", "ecosystem", "web of life"], weak: ["link", "relation", "together"] },
 { label: "Play and joy matter too", strong: ["play", "playful", "fun", "delight"], weak: ["game", "smile", "leisure"] },
 { label: "Balance is the aim", strong: ["balance", "equilibrium", "harmony"], weak: ["middle", "even", "steady"] },
 { label: "Money is a tool, not the goal", strong: ["money", "cash", "salary", "payment"], weak: ["price", "pay", "income"] },
 { label: "Know who you are", strong: ["identity", "self-knowledge", "self-awareness", "selfknowledge"], weak: ["purpose", "belong", "name"] },
 { label: "Conversation closes gaps", strong: ["conversation", "dialogue", "misunderstand", "communicat"], weak: ["message", "talk", "tell"] },
 { label: "Persistence beats talent", strong: ["persist", "perseveran", "tenacity", "resolve"], weak: ["continue", "keep", "repeat"] },
 { label: "Choose your own path", strong: ["autonomy", "independen", "choice", "choose"], weak: ["decide", "path", "select"] },
 { label: "Freedom comes with responsibility", strong: ["liberat", "emancipat"], weak: ["responsib", "duty", "choice"] },
 { label: "Ordinary moments hold meaning", strong: ["ordinary", "everyday", "mundane", "humdrum"], weak: ["moment", "daily", "small"] },
 { label: "Care for the body too", strong: ["exercise", "fitness", "nutrition"], weak: ["body", "healthy", "energy", "sleep"] },
 { label: "Be gentle with yourself", strong: ["self-compassion", "self-care", "selfcare", "self-kindness"], weak: ["gentle", "forgive", "rest"] },
 { label: "Loneliness is a signal", short: "Loneliness", desc: "Feeling alone points to a need for connection.", strong: ["lonely", "loneliness", "isolat", "alone"], weak: ["alone", "apart", "connect"] },
 { label: "Imperfection is part of life", strong: ["imperfect", "perfectionism", "flaw"], weak: ["flawed", "enough", "mistake"] },
 { label: "Beauty lies in attention", strong: ["beauty", "beautiful", "aesthetic"], weak: ["notice", "admire", "art"] },
 { label: "Small choices shape what follows", strong: ["consequence", "outcome", "ripple"], weak: ["choice", "decision", "result"] },
 { label: "Evidence over assumption", short: "Evidence", desc: "Claims should be tested, not simply believed.", strong: ["randomis", "randomiz", "hypothes", "replicat", "experiment"], weak: ["evidence", "sample", "study", "measure", "participants"] },
 { label: "Every gain has a trade-off", strong: ["trade-off", "tradeoff", "compromise", "drawback", "limitation"], weak: ["efficien", "precision", "however", "loss"] },
 { label: "Public trust needs accountability", strong: ["accountab", "oversight", "transparen", "corruption", "scrutin"], weak: ["council", "budget", "public", "vote", "spending"] },
 { label: "Priorities reveal values", short: "Priorities", desc: "How we spend money and time shows what we value.", strong: ["priorit", "allocat", "spending", "investment"], weak: ["fund", "plan", "budget"] },
 { label: "Short-term pressure hides long-term value", strong: ["quarter", "short-term", "slowdown", "forecast", "guidance", "outlook"], weak: ["invest", "strategy", "long-term", "decline"] },
 { label: "Attention is limited, so choose it", strong: ["distract", "wander", "absent-minded"], weak: ["stared", "notice", "focus", "forgot", "attention"] },
 { label: "Let go of the unimportant", strong: ["unimportant", "irrelevant", "insignificant", "trivial"], weak: ["important", "forgot", "drop", "ignore"] },
 { label: "Panic is the costliest mistake", strong: ["panic", "downturn", "crash", "rebalanc"], weak: ["sell", "reserve", "patience", "volatil"] },
 { label: "Small fees erode large returns", strong: ["fees", "expense", "commission"], weak: ["cost", "low", "passive"] },
 { label: "Big deals promise more than they deliver", strong: ["synerg", "integrat", "acquir", "overpay"], weak: ["deal", "savings", "rival", "engineering"] },
 { label: "Understanding comes before persuasion", strong: ["concession", "counteroffer", "bargain", "negotiat", "reservation"], weak: ["offer", "terms", "contract", "budget"] },
 { label: "Stress is the body's alarm", strong: ["stress", "cortisol", "adrenaline"], weak: ["immune", "tension", "digest"] },
 { label: "Listen to the body's signals", strong: ["symptom", "headache", "fatigue", "tired"], weak: ["diary", "doctor", "notice", "tiredness"] },
 { label: "Shame hides what needs help", short: "Shame", desc: "Shame keeps people from asking for the help they need.", strong: ["shame", "ashamed", "stigma"], weak: ["hide", "afraid", "disappoint", "fail"] },
 { label: "Small rituals steady the mind", strong: ["ritual", "serenity", "tranquil"], weak: ["quiet", "calm", "steady", "morning"] },
 { label: "Designed habits capture attention", strong: ["notification", "scroll", "dopamin", "engagement"], weak: ["reward", "habit", "feed", "compulsive", "check"] },
 { label: "Rest protects the mind", short: "Rest", desc: "Sleep and pause keep thinking clear.", strong: ["sleep", "circadian", "insomnia", "deprivation"], weak: ["rhythm", "caffeine", "routine", "rest", "fatigue"] },
 { label: "Hidden pain grows worse", strong: ["injur", "chronic", "physiotherap"], weak: ["hid", "hide", "excuse", "pain"] },
 { label: "Fear feeds its own rituals", strong: ["compulsi", "obsessive", "contaminat"], weak: ["wash", "reassur", "avoid", "fear", "exposure"] },
 { label: "Food shapes mood and appetite", strong: ["breakfast", "appetite", "cravings"], weak: ["yoghurt", "eggs", "cereal", "full", "protein"] },
 { label: "Climate change harms health", strong: ["heatwave", "heat", "pollut"], weak: ["cooling", "trees", "drought", "outdoor"] },
 { label: "Effort grows ability", strong: ["mindset", "praised"], weak: ["effort", "mistake", "puzzle", "persist"] },
 { label: "Fear can misfire in the body", strong: ["misfir", "palpitat", "hyperventil", "panic"], weak: ["breath", "sensation", "heart", "dying"] },
 { label: "Asking directly saves lives", strong: ["suicid", "self-harm", "warning"], weak: ["ask", "listen", "connect", "crisis"] },
 { label: "Addiction traps the mind", reframe: [["craving|cravings|crave|urge|urges|compulsion|compulsive", "Compulsion"], ["relapse|relapses|relapsing|relapsed", "Relapse"], ["alcohol|nicotine|cannabis|opioid|opioids", "Alcohol"], ["dependence|dependent|withdrawal|tolerance", "Dependence"], ["impaired|impairment|control|uncontrolled", "Loss of control"], ["harm|harms|harmful|damage|damaging|overdose", "Harm"]], short: "Addiction", desc: "Compulsive use narrows attention and freedom.", strong: ["addict", "alcohol", "relapse", "craving"], weak: ["drink", "recover", "counsell", "support"] },
 { label: "Control can become illness", strong: ["anorexia", "bulimia"], weak: ["control", "appearance", "therapy", "illness"] },
 { label: "Small daily care prevents big problems", strong: ["floss", "dentist", "prevent"], weak: ["daily", "check", "brush", "visit"] },
 { label: "Trust is slow to rebuild", strong: ["vaccin", "hesitan", "mistrust", "distrust"], weak: ["uncertain", "trust", "safety", "question"] },
 { label: "Fix the causes, not the symptoms", strong: ["workload", "unrealistic", "perk", "programme"], weak: ["stress", "deadline", "interrupt", "cause"] },
 { label: "Growing things restores wellbeing", strong: ["garden", "gardening", "planting", "horticultur"], weak: ["sunlight", "grow", "outdoors", "purpose", "community"] },
 { label: "Ask for help before crisis", strong: ["postnatal", "postpartum", "perinatal", "newborn"], weak: ["exhaust", "guilt", "screen", "recovery", "help"] },
 { label: "Small control calms fear", strong: ["predictab", "signal"], weak: ["control", "fear", "panic", "dentist", "avoid", "pause"] },
 { label: "Labels can explain struggles", strong: ["adhd", "diagnos", "neurodiver"], weak: ["medication", "focus", "structure", "lazy"] },
 { label: "Companionship calms the body", strong: ["pet", "animal"], weak: ["calming", "smile", "anxiety", "visits", "hospital", "dog"] },
 { label: "Expectation shapes experience", short: "Expectation", desc: "What we expect influences what we feel.", strong: ["placebo", "nocebo", "expectation", "hypnos", "suggestion"], weak: ["belief", "pain", "treatment", "honest"] },
 { label: "Healing takes steady care", strong: ["depressi", "setback", "relapse", "maintenance"], weak: ["recover", "therapy", "treatment", "support"] },
 { label: "Small brave steps ease fear", strong: ["avoidance", "anxious", "exposure", "hierarch", "gradual"], weak: ["step", "child", "school", "fear", "brave", "worry"] },
 { label: "Tools supplement human care", strong: ["supplement", "complement", "replac"], weak: ["clinician", "therapist", "human", "tool"] },
 { label: "Numbers are not verdicts", strong: ["verdict", "chart", "trend", "score"], weak: ["judge", "rating", "mood", "entry"] },
 { label: "Words can comfort when they feel true", strong: ["compassion", "self-forgiv"], weak: ["reading", "story", "essay", "passage", "gentle"] },
 { label: "Shared experience heals", strong: ["peer", "supporter", "mutual"], weak: ["community", "moderat", "trust", "experience"] },
 { label: "Care is a shared project", strong: ["clinician", "therapist", "consent"], weak: ["homework", "app", "data", "summary"] },
 { label: "Test the worst-case thought", strong: ["catastroph", "worst-case", "rumination"], weak: ["evidence", "anxious", "exam", "thought"] },
 { label: "Trusted people are the safety net", strong: ["counsellor", "helpline", "safe", "guardian"], weak: ["mum", "parent", "school", "talk", "trusted"] },
 { label: "Wishes and treachery", essay: "In Aladdin, wishes are granted by the lamp and the ring: the genie gives Aladdin a palace, a wife and a fortune. But every granted wish draws a rival who wants the same power, and the magician, the Vizier and the Sultan each turn a promise into a betrayal. The lesson is that a desire granted without understanding its cost becomes a trap, and that anyone offering a bargain for what we value is rarely acting for our sake.", desc: "Wishes can be granted at a price, and promises can be broken by those who seek to use us.", reframe: [["wish|wished|wishes|desire|desires|longing|ambition|greed|greedy|want|wanted", "Desire"], ["deceit|deceive|deceived|trick|tricked|impostor|disguise|disguised|betray|treacher|pretend|pretended|cunning", "Deception"], ["promise|promised|oath|vow|bargain|gratitude|grateful|debt", "Obligation"]], strong: ["wish", "wished", "wishes", "treacher", "treason", "betray", "deceit", "deceiv", "trickery", "impostor"], weak: ["lamp", "genie", "magician", "promise", "desire", "greed", "disguise", "trick"] }
];
const mkRx = t => new RegExp(t.length >= 5 ? '^' + t : '^' + t + '(?:s|es|ed|d|ing)?$');
const META_RX = META.map(m => ({ strong: m.strong.map(mkRx), weak: m.weak.map(mkRx) }));

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
// Verb forms used as node labels become nouns: "experienced" -> "Experience", "running" -> "Run".
const NOMINAL_EXCEPT = new Set(('morning evening ceiling building feeling meaning thing string king ring spring bring wing need speed seed bed red shed ' +
  'hundred sacred naked wicked kindred proceed succeed exceed indeed bleed feed breed greed heed steed weed reed freed led fed bred wed sled ' +
  'bored tired scared hatred record').split(' '));
const NOMINAL_KEEP = new Set(['belong', 'bring', 'sing', 'king', 'ring', 'swing', 'string', 'spring', 'long', 'along', 'strong', 'wrong', 'young', 'among', 'hang', 'gang', 'sang', 'rang']);
// Common concept adjectives and their nouns: "honest" -> "Honesty".
const ADJ_NOUN = { see: 'vision', seeing: 'vision', simpleton: 'simplicity', beautiful: 'beauty', wonderful: 'wonder', tired: 'fatigue',
  social: 'society', cognitive: 'cognition', chronic: 'persistence', environmental: 'environment', precious: 'treasure', honest: 'honesty', wise: 'wisdom', aware: 'awareness', brave: 'bravery', kind: 'kindness', proud: 'pride', humble: 'humility',
  patient: 'patience', lonely: 'loneliness', foolish: 'folly', stupid: 'stupidity', gentle: 'gentleness', generous: 'generosity', greedy: 'greed',
  angry: 'anger', afraid: 'fear', faithful: 'faith', wealthy: 'wealth', poor: 'poverty', strong: 'strength', weak: 'weakness', happy: 'happiness',
  sad: 'sadness', anxious: 'fear', ashamed: 'shame', cruel: 'cruelty', vain: 'vanity', arrogant: 'arrogance', crafty: 'cunning',
  magnificent: 'magnificence', simple: 'simplicity', looked: 'looks', looking: 'looks', calm: 'calm', unfit: 'unfitness', empty: 'emptiness', ready: 'eagerness', free: 'freedom' };
function nominalise(label) {
  if (/\s/.test(label)) return label;
  const w = label.toLowerCase();
  if (ADJ_NOUN[w]) return cap1(ADJ_NOUN[w]);
  if (w.length < 6 || NOMINAL_EXCEPT.has(w)) return label;
  let base = null;
  if (/ed$/.test(w)) base = /(ced|ved|zed|sed|ued|ared|ired|ured)$/.test(w) ? w.slice(0, -1) : w.slice(0, -2);
  else if (/ing$/.test(w)) {
    base = w.slice(0, -3);
    if (/[cvz]$/.test(base) || /(ar|ir|ur)$/.test(base) || (/s$/.test(base) && !/(us|ss)$/.test(base))) base += 'e';   // experienc -> experience, prepar -> prepare
    else if (/(ang|ong|ung|eng)$/.test(base) && !NOMINAL_KEEP.has(base)) base += 'e';       // chang -> change
    else if (/([^aeiou])\1$/.test(base)) base = base.slice(0, -1);                         // runn -> run
  }
  return base && base.length >= 3 ? cap1(base) : label;
}
function moralLabel(raw) {
  const t = raw.replace(/[\s.!?"”“]+$/g, '').trim();
  const m = /(?:the only thing that (?:truly |really )?matters|what (?:truly |really )?matters|the (?:only |most important )?thing(?: that)? (?:truly |really )?matters)\s+is\s+(.+)$/i.exec(t);
  if (m) return cap1(m[1].trim()) + ' is what matters';
  const parts = t.split(/[,;:]\s*/);
  let last = parts[parts.length - 1];
  if (last.split(/\s+/).length < 3 && parts.length > 1) last = parts.slice(-2).join(', ');
  const w = last.split(/\s+/).filter(Boolean);
  while (w.length > 3 && /^(but|and|so|that|then|because)$/i.test(w[0])) w.shift();
  return cap1(w.slice(0, 9).join(' '));
}
const MORAL_RE = /^\W*(?:the\s+)?(?:moral(?:\s+of\s+the\s+story)?|lesson|takeaway|morale|fazit|moral von der geschicht\w*)\s*[:\-–—]\s*(.+)$/i;
// Word classes for node names. A concept is a word the lexicon knows or an abstract noun form.
const isConcept = w => /(ness|ity|ism|ment|tion|sion|ance|ence|ship|hood|dom)s?$/.test(w) ||
  META_RX.some(m => m.strong.some(r => r.test(w)));          // strong keywords only: weak ones are too generic
const BASE_VERBS = new Set(('let rise hurry play look make take give get go come say tell know think want put seem find feel keep leave hear speak read do have be ' +
  'become let mean call try ask need believe hold stand lose pay meet include continue learn understand watch follow stop create walk remember ' +
  'love consider appear wait expect build stay reach remain suggest decide pull').split(' '));   // bare verbs are never nodes
const PHRASE_CONCEPT = { 'precious stones': 'Treasure', 'empty frames': 'Illusion', 'gentlemen weavers': 'Impostors' };
// Places and vague words that make weak Orbital names (kept as text, never as nodes).
const REPORT_VERBS = new Set('leaves leave increase decrease reduce lists list includes include describes describe notes note states state reports report shows show provides provide uses use contains defines considers'.split(' '));
const ORBITAL_DROP = new Set(('city town village country land kingdom africa african china chinese persia persian garden hall room ' +
  'animals repeat function condition association deliberation satisfaction fetch breathless review increase wonderful fool god ' +
  'dsm-5-tr icd-11 development mechanisms influence environment outcome awareness majesty purpose fatigue heart weariness innocent happiness').split(' ').concat(['city gates', 'attention deficit hyperactivity', 'hyperactivity disorder', 'general population', 'symptom', 'persistent', 'dysfunction', 'wonderful lamp', 'rise', 'let', 'niche', 'reality', 'choice', 'honour', 'amazement', 'knighthood', 'battles', 'muted', 'interaction', 'ordinary pleasures']))
const VERB_TAIL = new Set('gives give gave estimate estimates show shows found reported suggest suggests produce produces cause causes lead leads'.split(' '));;
const EXCLUDED_CENTRAL = new Set(['loom', 'looms']);   // never a node: a fixed exception
const INTERJECTIONS = new Set('oh ah alas wow hey ooh ugh well yes no ok okay please hello hi'.split(' '));
// Small semantic clusters: words that name the same kind of thing. Two nodes from one cluster are redundant.
const CLUSTERS = {
  ruler: 'emperor king queen ruler monarch sovereign majesty tsar empress prince princess',
  garment: 'clothes cloth clothing garment suit dress robe fabric',
  money: 'money wealth riches gold silk coins',
  fool: 'fool simpleton idiot dunce stupid foolish',
  simplicity: 'simplicity simple plain',
  vision: 'see sight vision eye look looks view',
  honesty: 'honesty honest truth truthful',
  fear: 'fear anxiety anxious dread terror panic afraid frightened scared fearful worried',
  pretense: 'pretense pretend pretence facade mask',
  crowd: 'crowd people townsfolk public citizen',
  drug: 'drug drugs substance substances narcotic',
  official: 'official officials minister officer courtier servant',
};
// Words that name no particular topic ("disorder", "behavior") are demoted as Central candidates.
// Academic and scaffolding words name no particular topic, so they are demoted as Central candidates.
// Words that can carry a story's meaning (behavior, belief, habit, ego, shadow, see, reward, ...) are deliberately not listed.
const GENERIC_CENTRAL = new Set((
  'according account accounts additionally adolescent adolescents adult adults although among analysed ' +
  'analyses analysis analyzed approach approaches area areas article articles aspect aspects ' +
  'assessment assessments association associations author authors background based broad broader case ' +
  'cases categories category chapter chapters characteristic characteristics citation citations ' +
  'classification classifications cohort cohorts commonly component components concept concepts ' +
  'conclusion conclusions condition conditions consistent consistently construct constructs context ' +
  'contexts controlled correlation correlations criteria criterion cross-sectional current currently ' +
  'data dataset datasets definition definitions demonstrate demonstrated demonstrates description ' +
  'descriptions despite deviation difference differences different dimension dimensions discussion ' +
  'disorder disorders domain domains effect effects element elements error errors especially essay ' +
  'estimate estimated estimates estimation evidence example examples experiment experimental ' +
  'experiments explanation explanations fact factor factors facts feature features field fields figure ' +
  'figures finding findings form forms found framework frameworks frequently function functions ' +
  'further furthermore future general generally given group groups guideline guidelines hence however ' +
  'hypotheses hypothesis illness illnesses impact impacts implication implications incidence include ' +
  'included includes including index indicate indicated indicates indices individual individuals ' +
  'instrument instruments interview interviews introduction involve involved involves involving issue ' +
  'issues journal kind kinds label labels level levels limitation limitations link linked links ' +
  'literature longitudinal matter matters mean measure measurement measurements measures mechanism ' +
  'mechanisms median meta-analysis method methodology methods moreover ' +
  'multiple numerous observation observational observations odds often outcome outcomes overall paper ' +
  'papers part participant participants particular particularly parts pattern patterns period periods ' +
  'phase phases point points population populations predict prediction predictions predictor ' +
  'predictors prevalence previous previously process processes properties property prospective ' +
  'question questionnaire questionnaires questions randomised randomized range ranges rate rates ratio ' +
  'ratios recent recently recommendation recommendations reference references relate related relates ' +
  'relationship relationships reported reporting reports research researcher researchers researching ' +
  'respectively result results retrospective review reviews role sample sample-size samples scale ' +
  'scales scope section sections several show showed shown shows significance significant similar ' +
  'specific stage stages standard statistical statistically step steps structure structures studied ' +
  'studies study subgroup subgroups suggest suggested suggests syndrome syndromes system systems table ' +
  'tables term terminology terms therefore thing things thus topic topics ' +
  'trial trials type types typically typology usage use used using value values variable variables ' +
  'variance various way ways whereas '
).split(' '));
const CLUSTER_OF = new Map();
Object.entries(CLUSTERS).forEach(([name, words]) => words.split(' ').forEach(w => CLUSTER_OF.set(stemWord(w), name)));
function clusterOf(label) {
  for (const w of label.split(/\s+/)) { const c = CLUSTER_OF.get(stemWord(w)); if (c) return c; }
  return null;
}
// Self-protective fear: a speaker who fears being seen as stupid or unfit, or who hides this ("no one must know").
const FEAR_FAMILY_RX = /^(fear|fearing|afraid|anxious|anxiety|frighten|frightened|scared|fearful|worried|worry|dread|terror|panic)(s|es|ed|d|ing)?$/;
const SELF_APPRAISAL_RX = /^(stupid|simpleton|unfit|ignorant|incompetent)$/;
const CONCEAL_RX = /^(confess|express|admit|know|said)$/;
const selfFearWord = w => { const x = w.toLowerCase(); return FEAR_FAMILY_RX.test(x) || SELF_APPRAISAL_RX.test(x) || /^(confess|express|admit)$/.test(x); };
function selfFearSentence(sn) {
  const low = sn.toks.map(x => x.low);
  if (low.some(w => FEAR_FAMILY_RX.test(w))) return true;                       // any fear word (both senses of "anxious")
  if (low.some((w, j) => SELF_APPRAISAL_RX.test(w) && low.slice(Math.max(0, j - 4), j).some(q => q === 'i' || q === 'me' || q === 'am'))) return true;   // "I am not stupid"
  return low.some((w, j) => CONCEAL_RX.test(w) && low.slice(Math.max(0, j - 3), j).some(q => /^(not|never|no|must|shall)$/.test(q)));
}
function countWords(t) { t = (t || '').trim(); return t ? t.split(/\s+/).length : 0; }
function validate(t) {
  const words = countWords(t);
  if (words < MIN_WORDS) return { ok: false, words, msg: `Please add a bit more text: at least ${MIN_WORDS} words are needed (you have ${words}).` };
  if (words > MAX_WORDS) return { ok: false, words, msg: `That is a lot of text. Please shorten it to ${MAX_WORDS.toLocaleString('en')} words or fewer (you have ${words.toLocaleString('en')}).` };
  return { ok: true, words };
}

function splitSentences(text) {
  const out = [], re = /(?:[^.!?\n]|[.!?](?!\s|$))+(?:[.!?]+(?=\s|$))?/g;
  const ABBR = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|vs|etc|inc|ltd|jr|sr|no|fig|e\.g|i\.e)\.$|\s\d{1,2}\.$/i;
  let m, buf = '';
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (!/\p{L}/u.test(s)) continue;
    buf = buf ? buf + ' ' + s : s;
    if (ABBR.test(s)) continue;
    out.push(buf); buf = '';
  }
  if (buf) out.push(buf);
  return out;
}
function tokenize(s) {
  const toks = [], re = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  let m;
  while ((m = re.exec(s))) {
    const raw = m[0].replace(/['’]s$/i, ''), c = raw[0];
    toks.push({
      raw, low: raw.toLowerCase(), start: m.index, end: m.index + m[0].length, used: false,
      upper: /\p{Lu}/u.test(c),
      isNum: /^\p{N}+$/u.test(raw),
      isAcr: raw.length >= 2 && raw.length <= 10 && raw === raw.toUpperCase() && raw !== raw.toLowerCase()
    });
  }
  return { text: s, toks };
}

function analyse(text) {
  const v = validate(text);
  if (!v.ok) return { ok: false, msg: v.msg };

  const sents = splitSentences(text).map(tokenize);
  /* --- language guess (English / German) --- */
  let en = 0, de = 0;
  sents.forEach(s => s.toks.forEach(t => { if (EN_STOP.has(t.low)) en++; if (DE_STOP.has(t.low)) de++; }));
  const lang = (de > en * 1.2 && de >= 6) ? 'de' : 'en';
  const STOP = lang === 'de' ? DE_STOP : EN_STOP, isStop = w => STOP.has(w);

  const midCaps = new Set(), seenLower = new Set();
  sents.forEach(s => s.toks.forEach((t, i) => {
    if (t.upper) { if (i > 0 && !isStop(t.low)) midCaps.add(t.low); } else seenLower.add(t.low);
  }));

  /* --- item registry: every candidate node (actor / topic / event) --- */
  const reg = new Map();
  const touch = (key, kind, surface, si, ent) => {
    let it = reg.get(key);
    if (!it) { it = { key, kind, ent: !!ent, surf: new Map(), tf: 0, sents: new Set(), first: si, words: 1 }; reg.set(key, it); }
    it.tf++; it.sents.add(si); it.surf.set(surface, (it.surf.get(surface) || 0) + 1);
    return it;
  };
  const perSent = sents.map(() => []);
  const hasEventWord = ws => ws.some(w => lang === 'de' ? EVENT_DE.some(e => w.includes(e)) : EVENT_STEMS.has(stem(w, lang)));

  /* Pass A: dates, years and named entities (capitalised phrases) */
  const ents = [];
  sents.forEach((s, si) => {
    const T = s.toks, tx = s.text;
    const adj = (a, b) => /^\s+$/.test(tx.slice(a.end, b.start));
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (t.used) continue;
      const isYear = /^(1[5-9]|20)\d\d$/.test(t.raw);
      if (MONTHS.has(t.low) && t.upper) {
        const d = T[i + 1], p = T[i - 1];
        const hasDay = d && /^\d{1,2}$/.test(d.raw) && /^\s+$/.test(tx.slice(t.end, d.start));
        const dayFirst = !hasDay && p && !p.used && /^\d{1,2}$/.test(p.raw) && /^\.?\s+$/.test(tx.slice(p.end, t.start));
        if (t.low === 'may' && !hasDay && !dayFirst) continue;
        let j = i, year = null;
        if (hasDay) j = i + 1;
        const y = T[j + 1];
        if (y && /^(1[5-9]|20)\d\d$/.test(y.raw) && /^[\s,]+$/.test(tx.slice(T[j].end, y.start))) { year = y.raw; j++; }
        if (dayFirst) p.used = true;
        for (let k = i; k <= j; k++) T[k].used = true;
        let label = null;
        if (hasDay) label = `${t.raw} ${d.raw}` + (year ? `, ${year}` : '');
        else if (dayFirst) label = `${p.raw}${lang === 'de' ? '.' : ''} ${t.raw}` + (year ? ` ${year}` : '');
        else if (year) label = `${t.raw} ${year}`;
        if (label) { const key = 'date:' + label.toLowerCase(); touch(key, 'event', label, si); perSent[si].push(key); }
        i = j;
      } else if (isYear) {
        t.used = true;
        const key = 'date:' + t.raw; touch(key, 'event', t.raw, si); perSent[si].push(key);
      }
    }
    const capLike = t => !t.used && t.upper && !isStop(t.low) && !MONTHS.has(t.low) && !INTERJECTIONS.has(t.low);
    for (let i = 0; i < T.length; i++) {
      if (!capLike(T[i])) continue;
      let j = i;
      for (;;) {
        const a = T[j], n = T[j + 1];
        if (!n || !adj(a, n)) break;
        if (capLike(n)) { j++; continue; }
        const c = T[j + 2];
        if (CONN.has(n.low) && c && adj(n, c) && capLike(c)) { j += 2; continue; }
        if (n.isNum && !n.used && n.raw.length <= 3) j++;
        break;
      }
      let a = i;
      if (j > a && ((a === 0 && seenLower.has(T[a].low)) || ROLE.has(T[a].low))) a++;
      const span = T.slice(a, j + 1), t0 = span[0], single = span.length === 1;
      const ok = !(single && ROLE.has(t0.low)) &&
        (!single || t0.isAcr || (lang !== 'de' && (a > 0 || midCaps.has(t0.low))));
      if (ok) {
        const surface = tx.slice(t0.start, span[span.length - 1].end).replace(/['’]s\b/gi, '');   // drop possessive 's
        ents.push({ si, surface, key: span.map(x => x.low).join(' '), words: span.map(x => x.low) });
        span.forEach(x => x.used = true);
      }
      i = j;
    }
  });
  /* merge "Kranz" into "Gene Kranz" when that is unambiguous */
  const entKeys = new Set(ents.map(e => e.key));
  const multi = [...entKeys].filter(k => k.includes(' '));
  const alias = new Map();
  entKeys.forEach(k => {
    if (k.includes(' ')) return;
    const c = multi.filter(m => m.split(' ').includes(k));
    if (c.length === 1) alias.set(k, c[0]);
  });
  const entWords = new Set();
  ents.forEach(e => {
    const key = alias.get(e.key) || e.key;
    const it = touch('ent:' + key, hasEventWord(e.words) ? 'event' : 'actor', e.surface, e.si, true);
    it.words = key.split(' ').length;
    perSent[e.si].push('ent:' + key);
    key.split(' ').forEach(w => entWords.add(w));
  });

  /* Pass B: recurring two-word phrases, then single words */
  const content = t => !t.used && !isStop(t.low) && t.low.length >= 3 && /^\p{L}[\p{L}\p{N}'’\-]*$/u.test(t.low) && !GENERIC.has(t.low) &&
    !(lang !== 'de' && t.low.length > 5 && /ly$/.test(t.low) && !/^(family|supply|assembly|reply|italy)$/.test(t.low));
  const votes = new Map();                      // does a word behave like a verb? (looks at the neighbouring words)
  if (lang !== 'de') {
    const PV = new Set('i you he she it we they who will would can could may might must should shall not never also to'.split(' '));
    const PN = new Set('the a an this these those his her their its my our your each every another some any such no'.split(' '));
    const NV = new Set('the a an his her their its my our your them him me us this these those'.split(' '));
    const NS = new Set('he she it they we i you there to'.split(' '));
    sents.forEach(s => {
      const T = s.toks, adj = (a, b) => /^\s+$/.test(s.text.slice(a.end, b.start));
      T.forEach((t, i) => {
        if (!content(t) || t.low.length < 4) return;
        const p = T[i - 1], n = T[i + 1];
        let vv = 0, nn = 0;
        if (p && adj(p, t)) { if (PV.has(p.low)) vv++; else if (PN.has(p.low)) nn++; }
        if (n && adj(t, n)) { if (NV.has(n.low)) vv++; else if (NS.has(n.low) || (n.low.length > 4 && /ly$/.test(n.low))) vv += .5; }
        if (/(?:tion|sion|ment|ness|ity|ance|ence|ship|ism)s?$/.test(t.low)) nn++;
        const k = 'w:' + stem(t.low, lang), o = votes.get(k) || { v: 0, n: 0 };
        o.v += vv; o.n += nn; votes.set(k, o);
      });
    });
  }
  const bi = new Map();
  sents.forEach(s => {
    const T = s.toks;
    for (let i = 0; i + 1 < T.length; i++) {
      if (content(T[i]) && content(T[i + 1]) && !/ed$/.test(T[i].low.length > 5 ? T[i].low : '') && !/ed$/.test(T[i + 1].low.length > 5 ? T[i + 1].low : '') && /^\s+$/.test(s.text.slice(T[i].end, T[i + 1].start))) {
        const k = stem(T[i].low, lang) + ' ' + stem(T[i + 1].low, lang);
        bi.set(k, (bi.get(k) || 0) + 1);
      }
    }
  });
  sents.forEach((s, si) => {
    const T = s.toks;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (!content(t)) continue;
      const n = T[i + 1];
      if (lang !== 'de' && n && content(n) && !(t.low.length > 5 && /ed$/.test(t.low)) && !(n.low.length > 5 && /ed$/.test(n.low)) && /^\s+$/.test(s.text.slice(t.end, n.start))) {
        const k = stem(t.low, lang) + ' ' + stem(n.low, lang);
        if ((bi.get(k) || 0) >= 2) {
          const key = 'phr:' + k, surf = lang === 'de' ? `${t.raw} ${n.raw}` : `${t.low} ${n.low}`;
          const it = touch(key, hasEventWord([t.low, n.low]) ? 'event' : 'topic', surf, si);
          it.words = 2; perSent[si].push(key); i++; continue;
        }
      }
      if (t.low.length >= 3 && (lang !== 'de' || t.upper)) {
        const key = 'w:' + stem(t.low, lang);
        touch(key, hasEventWord([t.low]) ? 'event' : 'topic', lang === 'de' ? t.raw : t.low, si);
        perSent[si].push(key);
      }
    }
  });

  /* --- ranking: TextRank over co-occurrence, blended with frequency --- */
  const items = [...reg.values()];
  items.forEach(it => {
    const o = votes.get(it.key);
    it.verbish = !!o && o.v > o.n && o.v >= .5;
    // plain past-tense forms ("placed", "asked") are verbs, not themes
    if (lang !== 'de' && it.key.startsWith('w:') && [...it.surf.keys()].every(f => /^[a-z]{4,}ed$/.test(f) && !/^(hundred|sacred|naked|wicked|kindred)$/.test(f))) it.verbish = true;
  });
  const adjW = new Map(items.map(it => [it.key, new Map()]));
  const bump = (a, b, w) => {
    if (a === b) return;
    adjW.get(a).set(b, (adjW.get(a).get(b) || 0) + w);
    adjW.get(b).set(a, (adjW.get(b).get(a) || 0) + w);
  };
  const uniq = perSent.map(k => [...new Set(k)].slice(0, 25));
  uniq.forEach((U, si) => {
    for (let a = 0; a < U.length; a++) for (let b = a + 1; b < U.length; b++) bump(U[a], U[b], 1);
    if (uniq[si + 1]) for (const a of U.slice(0, 8)) for (const b of uniq[si + 1].slice(0, 8)) bump(a, b, .3);
  });
  let pr = new Map(items.map(it => [it.key, 1]));
  for (let iter = 0; iter < 25; iter++) {
    const next = new Map();
    items.forEach(it => {
      let sum = 0;
      adjW.get(it.key).forEach((w, nb) => {
        let tot = 0; adjW.get(nb).forEach(x => tot += x);
        sum += w / (tot || 1) * pr.get(nb);
      });
      next.set(it.key, .15 + .85 * sum);
    });
    pr = next;
  }
  const maxPr = Math.max(...pr.values(), 1e-9), maxTf = Math.max(...items.map(i => i.tf), 1);
  items.forEach(it => {
    // label: entities prefer their longest form, topics their most frequent form
    const forms = [...it.surf.entries()];
    forms.sort((a, b) => it.ent ? (b[0].length - a[0].length) : (b[1] - a[1] || a[0].length - b[0].length));
    if (it.key.startsWith('phr:') && lang !== 'de' && it.words === 2) {
      const base = forms[0][0], follow = new Map();
      it.sents.forEach(si => {
        const re = new RegExp('\\b' + base.replace(/\s+/g, '\\s+') + '\\s+(\\p{L}+)', 'giu');
        let mm; while ((mm = re.exec(sents[si].text))) {
          const w = mm[1].toLowerCase();
          if (!isStop(w) && w.length >= 3 && !/(ed|ing|ly)$/.test(w) && !BASE_VERBS.has(w)) follow.set(w, (follow.get(w) || 0) + 1);
        }
      });
      const top = [...follow.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) forms[0][0] = base + ' ' + top[0];
    }
    it.label = it.ent || lang === 'de' ? forms[0][0] : cap1(forms[0][0]);
    let s = .55 * (pr.get(it.key) / maxPr) + .45 * Math.log(1 + it.tf) / Math.log(1 + maxTf);
    if (it.ent) s *= it.words > 1 ? 1.6 : 1.3;
    if (it.key.startsWith('date:') && /\p{L}/u.test(it.label)) s *= 1.4;
    if (it.words === 2 && !it.ent) s *= 1.15;
    if (it.kind === 'topic' && !it.ent) {
      const vb = w => w.length > 5 && /(ed|ing)$/.test(w);
      if (it.key.startsWith('phr:') ? it.key.slice(4).split(' ').some(vb) : vb(it.key.slice(2))) s *= it.words === 2 ? .75 : .65;
    }
    if (it.tf === 1 && !it.ent && it.words === 1 && it.kind === 'topic') s *= .55;
    if (it.verbish && !it.ent) s *= .3;
    it.person = !it.ent && it.label.toLowerCase().split(/\s+/).every(w => PERSON.has(w));
    if (it.person) s *= .4;                                   // roles (father, daughter) are rarely the point
    if (it.first <= 1) s *= 1.08;
    it.score = s;
  });

  /* --- lessons: sentences that state a takeaway --- */
  const LES = lang === 'de' ? LESSON_DE : LESSON_EN;
  const sentScore = si => uniq[si].map(k => reg.get(k).score).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
  const lessons = [];
  sents.forEach((s, si) => {
    const m = LES.exec(s.text);
    if (!m) return;
    let rest = s.text.slice(m.index + m[0].length).split(/[,;:—–()]/)[0].trim().replace(/[.!?]+$/, '');
    let w = rest.split(/\s+/).filter(Boolean).slice(0, 6);
    while (w.length && isStop(w[0].toLowerCase())) w.shift();
    while (w.length && isStop(w[w.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ''))) w.pop();
    if (w.length < 2 || !w.some(x => !isStop(x.toLowerCase()))) return;
    const label = cap1(w.join(' ').slice(0, 56));
    lessons.push({ key: 'lesson:' + si, kind: 'lesson', label, tf: 1, sents: new Set([si]), score: sentScore(si) + .2 });
  });
  lessons.sort((a, b) => b.score - a.score);

  /* --- Meta: the abstract idea behind the text (lexicon match; falls back to an explicit takeaway sentence) --- */
  let lex = null;
  if (lang !== 'de') {
    const wordHits = new Map(), tally = META_RX.map(() => new Map());
    sents.forEach((s, si) => s.toks.forEach(t => {
      let hits = wordHits.get(t.low);
      if (!hits) {
        hits = [];
        META_RX.forEach((m, ci) => {
          if (m.strong.some(r => r.test(t.low))) hits.push({ ci, w: 1 });
          else if (m.weak.some(r => r.test(t.low))) hits.push({ ci, w: .45 });
        });
        wordHits.set(t.low, hits);
      }
      hits.forEach(h => {
        let o = tally[h.ci].get(t.low);
        if (!o) { o = { w: h.w, cnt: 0, sents: new Set() }; tally[h.ci].set(t.low, o); }
        o.cnt++; o.sents.add(si);
      });
    }));
    const scoreOf = (mp, ci) => { let sc = 0; mp.forEach(o => sc += o.w * (1 + .25 * Math.min(o.cnt - 1, 3))); return sc * (META[ci].penalty || 1); };
    let best = null;
    tally.forEach((mp, ci) => {                                  // first choice: a clear match
      const sc = scoreOf(mp, ci);
      if (mp.size >= 2 && sc >= 2 && (!best || sc > best.sc)) best = { ci, sc };
    });
    if (!best) tally.forEach((mp, ci) => {                      // second choice: at least one strong keyword
      const sc = scoreOf(mp, ci);
      if (sc >= 1 && (!best || sc > best.sc)) best = { ci, sc };
    });
    if (best) {
      const mp = tally[best.ci], sset = new Set(), sScore = new Map();
      mp.forEach(o => o.sents.forEach(si => { sset.add(si); sScore.set(si, (sScore.get(si) || 0) + o.w); }));
      lex = { label: META[best.ci].label, short: META[best.ci].short, desc: META[best.ci].desc, essay: META[best.ci].essay, reframe: META[best.ci].reframe, sents: sset, wordSet: new Set(mp.keys()), weakWordSet: new Set([...mp.keys()].filter(k => mp.get(k).w < 1)),
              count: [...mp.values()].reduce((a, o) => a + o.cnt, 0),
              rank: [...sScore.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]) };
    }
  }
  let meta = null;
  const moralAt = sents.findIndex(s => MORAL_RE.test(s.text));       // "Moral: ..." wins: the text says it itself
  if (moralAt >= 0) {
    const body = MORAL_RE.exec(sents[moralAt].text)[1];
    meta = { label: moralLabel(body), sents: new Set([moralAt, ...(lex ? lex.sents : [])]), wordSet: lex ? lex.wordSet : null,
             count: 1, rank: [moralAt, ...(lex ? lex.rank : [])] };
  } else if (lex) meta = lex;
  else if (lessons.length) {
    const l = lessons[0];
    meta = { label: l.label, sents: l.sents, wordSet: null, count: 1, rank: [...l.sents] };
  }
  if (!meta) meta = { label: '?', unknown: true, sents: new Set(), wordSet: null, count: 0, rank: [] };   // honest 'unknown': no idea fits

  /* --- Core Ideas: 1-2 centroids (3 if there is no Meta and the text is long) --- */
  const S = sents.length, isDate = it => it.key.startsWith('date:');
  const wc = it => it.label.split(/\s+/).length;
  const cov = it => it.sents.size / S;                         // share of sentences that mention it
  const isWeakWord = it => (it.words > 1 && it.label.toLowerCase().split(/\s+/).some(w => VERB_TAIL.has(w))) ||
    REPORT_VERBS.has(it.label.toLowerCase().split(/\s+/)[0]) || EXCLUDED_CENTRAL.has(it.label.toLowerCase()) || ORBITAL_DROP.has(it.label.toLowerCase()) || ORBITAL_DROP.has(nominalise(it.label).toLowerCase()) ||
    (it.words === 1 && !it.ent && /(ize|ise)$/.test(nominalise(it.label).toLowerCase())) || INTERJECTIONS.has(it.label.toLowerCase()) ||
    (!it.ent && (BASE_VERBS.has(it.label.toLowerCase()) || (it.words === 1 && it.label.length <= 2)));
  const stemsOf = it => it.label.toLowerCase().split(/\s+/).map(w => stem(w.replace(/[^\p{L}\p{N}]/gu, ''), lang));
  const jac = (a, b) => { let n = 0; a.sents.forEach(x => { if (b.sents.has(x)) n++; }); return n / (a.sents.size + b.sents.size - n || 1); };
  const fail = { ok: false, msg: 'I could not find enough distinct names, topics or events in this text. Try a text with more varied content.' };

  let pool = items.filter(it => !isDate(it) && !it.verbish && !isWeakWord(it) && wc(it) <= 3 && (it.tf >= 2 || it.ent));
  if (!pool.length) pool = items.filter(it => !isDate(it) && !isWeakWord(it) && wc(it) <= 3);
  if (!pool.length) return fail;
  const pMax = Math.max(...pool.map(i => i.score), 1e-9), cMax = Math.max(...pool.map(cov), 1e-9);
  const metaWordStems = meta && meta.weakWordSet ? new Set([...meta.weakWordSet].map(stemWord)) : new Set();   // weakly matched idea words
  const conceptItem = it => (it.ent && it.words === 1 && midCaps.has(it.label.toLowerCase())) || it.kind === 'lesson' || nominalise(it.label).toLowerCase().split(/\s+/).some(isConcept);   // single names, not titles
  pool.forEach(it => it.cscore = (.5 * it.score / pMax + .5 * cov(it) / cMax) * (wc(it) === 1 ? 1.1 : 1) * (conceptItem(it) ? 1.3 : 1) * (it.label.toLowerCase().split(/\s+/).some(w => GENERIC_CENTRAL.has(w)) ? .4 : 1) * (wordStems(it.label).some(w => metaWordStems.has(w)) ? 1.6 : 1));  // short words and concepts win; generic ones lose
  pool.sort((a, b) => b.cscore - a.cscore);

  const Cmax = v.words < 90 ? 1 : v.words < 300 ? 2 : v.words < 1000 ? 3 : 4;        // long texts can carry three Core Ideas (plus the Meta node)
  const cores = [];
  const metaStems = new Set(meta ? wordStems(meta.short || meta.label) : []);   // Central names must not repeat the Meta name
  for (const it of pool) {
    if (cores.length >= Cmax) break;
    if (stemsOf(it).some(w => metaStems.has(w))) continue;
    const cl = clusterOf(nominalise(it.label));
    if (cl && (cores.some(c => clusterOf(nominalise(c.label)) === cl) || (meta && clusterOf(meta.short || meta.label) === cl))) continue;
    if (cores.length) {
      if (it.cscore < .25 * cores[0].cscore) break;            // a further core must still be a real theme
      if (cores.length === 3 && it.cscore < .35 * cores[0].cscore) break;   // a fourth core must be clearly strong
      if (it.sents.size < 2) continue;
      if (cores.some(c => jac(c, it) > .6 || stemsOf(c).some(w => stemsOf(it).includes(w)))) continue;
    }
    cores.push(it);
  }

  /* --- Themes: small satellites around each centroid --- */
  const coreSet = new Set(cores), coreStems = new Set(cores.flatMap(stemsOf));
  const maxAll = Math.max(...items.map(i => i.score), 1e-9);
  const cand = items.filter(it => {
    if (coreSet.has(it) || it.person || (it.verbish && !it.ent) || isWeakWord(it)) return false;   // no verbs, no bare roles, no interjections
    if (it.sents.size < (v.words >= 300 ? 2 : 1) && it.kind !== 'lesson') return false;   // longer texts: an Orbital idea must recur
    if (isDate(it) && !/\p{L}/u.test(it.label)) return false;  // bare years are noise
    if (!it.ent && it.words === 1 && entWords.has(it.label.toLowerCase())) return false;
    return (it.ent && it.words > 1) || !stemsOf(it).some(w => coreStems.has(w));  // "Eggs" next to the core "Egg" would only repeat it
  });
  const aff = (it, c) => {
    let w = 0, d = 1e9;
    for (const s of it.sents) {
      if (c.sents.has(s)) w += 1; else if (c.sents.has(s - 1) || c.sents.has(s + 1)) w += .35;
      for (const t of c.sents) d = Math.min(d, Math.abs(s - t));
    }
    return { w, d };
  };
  const used = new Set(cores.map(c => c.label.toLowerCase()));
  const usedStems = new Set(coreStems);           // one theme per word family: 'Coffee bean' and 'Ground coffee' would repeat each other
  const sat = cores.map(() => []);
  let metaSat = [];
  if (meta) {                                                   // Meta takes the words that evidence it
    used.add(meta.label.toLowerCase());
    const evid = cand.filter(it => !it.verbish && !isDate(it) && (meta.wordSet
        ? it.label.toLowerCase().split(/\s+/).some(w => meta.wordSet.has(w))
        : [...it.sents].some(s => meta.sents.has(s))))
      .sort((a, b) => b.score - a.score);
    for (const it of evid) {
      if (metaSat.length >= (v.words >= 500 ? 3 : 2)) break;
      if (!used.has(it.label.toLowerCase()) && !stemsOf(it).some(w => usedStems.has(w))) { metaSat.push(it); used.add(it.label.toLowerCase()); stemsOf(it).forEach(w => usedStems.add(w)); }
    }
  }
  if (meta && meta.reframe) {                                    // each rule names a Meta satellite, with its own evidence
    metaSat = meta.reframe.map(([p, l]) => {
      let hits = new Set(), trig;
      if (p === '@self-fear') {                                  // self-protective fear: see selfFearSentence
        sents.forEach((sn, si) => { if (selfFearSentence(sn)) hits.add(si); });
        trig = { test: selfFearWord };
      } else {
        const rx = new RegExp('^(?:' + p + ')(?:s|es|ed|d|ing)?$');
        sents.forEach((sn, si) => sn.toks.forEach(tk => { if (rx.test(tk.low)) hits.add(si); }));
        trig = { test: w => rx.test(w.toLowerCase()) };
      }
      return { label: l, score: maxAll * .5, tf: hits.size, sents: hits, trig, words: 1, kind: 'theme', ent: false, verbish: false, person: false };
    }).filter(it => it.sents.size > 0);
  }
  const properName = it => it.ent && (it.words > 1 || midCaps.has(it.label.toLowerCase()));   // not just a capitalised word at a sentence start
  const conceptOf = it => properName(it) || it.kind === 'lesson' ||
    nominalise(it.label).toLowerCase().split(/\s+/).some(isConcept);   // a name or a strong concept, never a plain object
  const trip = [];
  cand.forEach(it => cores.forEach((c, ci) => {
    const a = aff(it, c);
    trip.push({ it, ci, linked: a.w > 0, concept: conceptOf(it), val: .3 * Math.min(a.w, 2) / 2 + .7 * it.score / maxAll + .02 / (1 + a.d) });  // important words first
  }));
  trip.sort((a, b) => b.val - a.val);
  const T = Math.min(cores.length * 6, Math.max(3, Math.round(2 + v.words / 50)));   // satellite budget (cores)
  const cap = Math.min(6, Math.ceil(T / cores.length) + 1);
  let total = 0;
  const add = t => { sat[t.ci].push(t); used.add(t.it.label.toLowerCase()); stemsOf(t.it).forEach(w => usedStems.add(w)); total++; };
  const okay = t => !used.has(t.it.label.toLowerCase()) && !stemsOf(t.it).some(w => usedStems.has(w) && !coreStems.has(w));
  for (const t of trip) {
    if (total >= T) break;
    if (t.linked && t.concept && okay(t) && sat[t.ci].length < cap) add(t);
  }
  cores.forEach((c, ci) => {                                    // every core gets at least two themes
    for (const t of trip) { if (sat[ci].length >= 2) break; if (t.ci === ci && t.concept && okay(t)) add(t); }
  });
  if (!cores.length) return fail;

  /* --- output: centroids (Core Ideas, Meta), themes, spokes and long bridges between centroids --- */
  const maxC = Math.max(...cores.map(c => c.cscore), 1e-9);
  const trim = s => s.length > 190 ? s.slice(0, 187).replace(/\s+\S*$/, '') + '…' : s;
  const snipsOf = list => list.slice(0, 2).sort((a, b) => a - b).map(si => trim(sents[si].text));
  // terms that count as the node's word: its stems, its cluster, and its noun/adjective partners
  const termStemsFor = label => {
    const base = new Set(wordStems(label));
    const cl = clusterOf(label);
    if (cl) CLUSTERS[cl].split(' ').forEach(w => base.add(stemWord(w)));
    Object.entries(ADJ_NOUN).forEach(([k, val]) => {
      if (base.has(stemWord(val)) || base.has(stemWord(k))) { base.add(stemWord(k)); base.add(stemWord(val)); }
    });
    return base;
  };
  // up to five sentences, each as segments {t, h}; h marks the words to highlight
  const usedLead = new Set();                                  // lead sentences already shown on another node's card
  const occOf = (list, terms) => {
    const isHit = w => typeof terms === 'function' ? terms(w) : terms.has(stemWord(w));
    const built = list.map(si => {
      const sn = sents[si], out = []; let pos = 0;
      sn.toks.forEach(tk => {
        if (tk.start > pos) out.push({ t: sn.text.slice(pos, tk.start), h: false });
        const w = sn.text.slice(tk.start, tk.end);
        out.push({ t: w, h: isHit(w) });
        pos = tk.end;
      });
      if (pos < sn.text.length) out.push({ t: sn.text.slice(pos), h: false });
      if (!out.some(g => g.h)) out.push({ t: ' ', h: false }, { t: '[indirect]', ind: true });   // the node is meant, but no word shows it
      return { si, out, hits: out.filter(g => g.h).length };
    });
    const score = b => b.hits - (usedLead.has(b.si) ? 1.5 : 0);   // prefer a lead sentence no other card has used
    built.sort((a, b) => score(b) - score(a) || sentScore(b.si) - sentScore(a.si) || a.si - b.si);
    if (built.length) usedLead.add(built[0].si);
    const plainSegs = si => {
      const sn = sents[si], out = []; let pos = 0;
      sn.toks.forEach(tk => { if (tk.start > pos) out.push({ t: sn.text.slice(pos, tk.start), h: false }); out.push({ t: sn.text.slice(tk.start, tk.end), h: false }); pos = tk.end; });
      if (pos < sn.text.length) out.push({ t: sn.text.slice(pos), h: false });
      return out;
    };
    const REFER = /^(this|these|that|those|it|its|they|their|them|he|she|his|her|such|however|therefore|thus|hence|both|also|similarly|moreover|furthermore)$/;
    return built.slice(0, 3).map(b => {
      const sn = sents[b.si], first = sn.toks[0], last = sn.toks.length;
      const before = b.si > 0 && ((first && REFER.test(first.low)) || last < 9);     // refers back, or too short to stand alone
      const nextRefers = b.si + 1 < sents.length && sents[b.si + 1].toks[0] && REFER.test(sents[b.si + 1].toks[0].low);
      const after = b.si + 1 < sents.length && (/:\s*$/.test(sn.text) || nextRefers);   // introduces, or is continued by, the next sentence
      return { segs: b.out, ctx: before ? plainSegs(b.si - 1) : null, tail: after ? plainSegs(b.si + 1) : null };
    });
  };
  const nodes = [], links = [], cents = cores.slice();
  cores.forEach((c, i) => nodes.push({ id: 'n' + i, label: nominalise(c.label), kind: 'core', core: true,
    w: .65 + .35 * c.cscore / maxC, count: c.sents.size, occ: occOf([...c.sents].sort((a, b) => a - b), termStemsFor(nominalise(c.label))) }));
  if (meta) {
    cents.push(meta);
    nodes.push({ id: 'n' + nodes.length, label: meta.short || meta.label, full: meta.label, desc: meta.desc || '', essay: meta.essay || '', kind: 'meta', core: true, unknown: !!meta.unknown, w: 1, count: meta.sents.size, occ: occOf(meta.rank, meta.wordSet ? new Set([...meta.wordSet].map(stemWord)) : termStemsFor(meta.label)) });
  }
  // every node name so far: no orbital name may repeat a word or a whole name already used
  const outLabels = cores.map(c => nominalise(c.label));
  if (meta) outLabels.push(meta.short || meta.label);
  const labelStems = new Set(), seenLabels = new Set(), usedClusters = new Set();
  const claim = label => {
    wordStems(label).forEach(w => labelStems.add(w)); seenLabels.add(label.toLowerCase());
    const cl = clusterOf(label); if (cl) usedClusters.add(cl);
  };
  outLabels.forEach(claim);
  const themeNode = (it, ci) => {
    const label = dedupeLabel(PHRASE_CONCEPT[it.label.toLowerCase()] || nominalise(it.label), labelStems);
    if (!label || seenLabels.has(label.toLowerCase()) || usedClusters.has(clusterOf(label))) return;   // nothing new to say: skip the node
    claim(label);
    const id = 'n' + nodes.length;
    nodes.push({ id, label, kind: 'theme', core: false, w: Math.max(.15, Math.min(1, it.score / maxAll)),
      count: it.sents.size, occ: occOf([...it.sents].sort((a, b) => a - b), it.trig ? (w => it.trig.test(w.toLowerCase())) : termStemsFor(label)) });
    links.push([id, 'n' + ci, 'spoke']);
  };
  sat.forEach((list, ci) => list.forEach(t => themeNode(t.it, ci)));
  metaSat.forEach(it => themeNode(it, cores.length));
  const cb = [];
  for (let i = 0; i < cents.length; i++) for (let j = i + 1; j < cents.length; j++) {
    const r = aff(cents[i], cents[j]); cb.push({ i, j, sc: r.w + .01 / (1 + r.d) });
  }
  cb.sort((a, b) => b.sc - a.sc);
  const par = cents.map((_, i) => i), find = x => par[x] === x ? x : (par[x] = find(par[x]));
  cb.forEach(e => { const a = find(e.i), b = find(e.j); if (a !== b) { par[a] = b; links.push(['n' + e.i, 'n' + e.j, 'bridge']); } });
  cb.forEach(e => {                                            // strongly related centrals/meta may share more links
    const linked = links.some(l => l[2] === 'bridge' && ((l[0] === 'n' + e.i && l[1] === 'n' + e.j) || (l[0] === 'n' + e.j && l[1] === 'n' + e.i)));
    if (e.sc >= 2 && !linked) links.push(['n' + e.i, 'n' + e.j, 'bridge']);
  });

  // card summary: why the node matters, in one sentence
  const parentOf = new Map(), kidsOf = new Map(), bridgesOf = new Map();
  links.forEach(([a, b, type]) => {
    if (type === 'spoke') { parentOf.set(a, b); kidsOf.set(b, [...(kidsOf.get(b) || []), a]); }
    else { bridgesOf.set(a, [...(bridgesOf.get(a) || []), b]); bridgesOf.set(b, [...(bridgesOf.get(b) || []), a]); }
  });
  const labelOf = id => nodes.find(x => x.id === id).label;
  nodes.forEach(n => {
    if (n.kind === 'meta') { n.summary = n.desc || `${n.label} is the idea behind the text.`; return; }
    if (n.kind === 'core') {
      const tied = [...(kidsOf.get(n.id) || []), ...(bridgesOf.get(n.id) || [])].map(labelOf).slice(0, 3);
      n.summary = `${n.label} is one of the text's central subjects: it appears in ${n.count} of ${sents.length} sentences${tied.length ? ', closely tied to ' + tied.join(', ') : ''}.`;
    } else {
      n.summary = `${n.label} sits under ${labelOf(parentOf.get(n.id))}: it appears in ${n.count} of ${sents.length} sentences.`;
    }
  });
  return { ok: true, nodes, edges: links,
           stats: { words: v.words, sentences: S, lang, cores: cores.length, meta: meta ? meta.label : null } };
}
root.TinyModel = { analyse, validate, countWords, MIN_WORDS, MAX_WORDS };
})(typeof window !== 'undefined' ? window : globalThis);
