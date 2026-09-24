// The story: a chain of quests told by a cast of oddball characters, from the harbor to The Void.
import type { Rarity } from './fish';
import type { TrackId } from './upgrades';
import type { RealmId, ZoneId } from './zones';

export type NpcId = 'marta' | 'finn' | 'coralia' | 'sludge' | 'barnacle' | 'stranger' | 'rex' | 'vex' | 'nova' | 'synthia';

export interface Npc { name: string; title: string; face: string; color: string }

export const NPCS: Record<NpcId, Npc> = {
  marta: { name: 'Old Marta', title: 'Tackle Shop owner', face: '&#128117;', color: '#ff9a3c' },
  finn: { name: 'Prof. Finnegan', title: 'Marine biologist', face: '&#129489;&#8205;&#128300;', color: '#3a86ff' },
  coralia: { name: 'Queen Coralia', title: 'Ruler of the reef', face: '&#129500;&#8205;&#9792;&#65039;', color: '#ff5aa8' },
  sludge: { name: 'Dr. Sludge', title: 'Definitely a real doctor', face: '&#129514;', color: '#7ad030' },
  barnacle: { name: 'Captain Barnacle', title: 'Ghost pirate', face: '&#128128;', color: '#50c0a0' },
  stranger: { name: 'The Stranger', title: '???', face: '&#128065;&#65039;', color: '#8a5ad0' },
  rex: { name: 'Dr. Rex Rexington', title: 'Time-lost chronobiologist', face: '&#129430;', color: '#5ac070' },
  vex: { name: 'Vex', title: 'Demon hunter, fishes by smell', face: '&#128520;', color: '#70ff40' },
  nova: { name: 'Commander Nova', title: 'SS Tackle Box, lunar division', face: '&#128105;&#8205;&#128640;', color: '#9ab0e0' },
  synthia: { name: 'DJ Synthia', title: 'Live from the Neon Dimension', face: '&#127911;', color: '#ff5ab0' },
};

export type QuestGoal =
  | { kind: 'catch'; n: number; species?: string; zone?: ZoneId; rarity?: Rarity; storm?: boolean; night?: boolean }
  | { kind: 'sell'; amount: number }
  | { kind: 'upgrade'; track: TrackId; tier: number }
  | { kind: 'visit'; zone: ZoneId }
  | { kind: 'dex'; n: number }
  | { kind: 'depth'; meters: number }
  | { kind: 'boss'; species: string }
  | { kind: 'realm'; realm: RealmId };

export interface Quest {
  id: string;
  npc: NpcId;
  title: string;
  goal: QuestGoal;
  intro: string[];
  outro: string[];
  reward: { money: number; pearls: number; cosmetic?: string };
  /** Screen shown after the outro: a cliffhanger, or the true ending. */
  after?: 'teaser' | 'finale';
}

const Q = (id: string, npc: NpcId, title: string, goal: QuestGoal, reward: Quest['reward'], intro: string[], outro: string[], after?: Quest['after']): Quest =>
  ({ id, npc, title, goal, reward, intro, outro, after });

export const QUESTS: Quest[] = [
  Q('first', 'marta', 'Catch 3 fish', { kind: 'catch', n: 3 }, { money: 50, pearls: 1 },
    ["Well hello there, sprout! Name's Marta. I run the Tackle Shop on the island.",
      'That boat of yours has seen better days... but the fish won\'t mind!',
      'Hold Space to cast, steer the lure into a fish, then reel it in. Bring me three!'],
    ['Look at that! A natural. Now let\'s turn those fish into cash.']),
  Q('sell', 'marta', 'Sell $40 of fish at the Tackle Shop', { kind: 'sell', amount: 40 }, { money: 40, pearls: 1, cosmetic: 'pet-cat' },
    ['Sail back to my dock - the gold $ on your minimap - and press E to sell.'],
    ['Pleasure doing business! Oh - my cat Mittens has taken a shine to you.', "Take her along. She's great luck. And she eats the small ones."]),
  Q('rod', 'marta', 'Buy the Bamboo Rod', { kind: 'upgrade', track: 'rod', tier: 1 }, { money: 100, pearls: 2 },
    ['That twig you call a rod won\'t reach anything good. The Bamboo Rod goes twice as deep!'],
    ['Now THAT is a rod. The deep water is calling, sprout.']),
  Q('dex8', 'finn', 'Log 8 different species', { kind: 'dex', n: 8 }, { money: 250, pearls: 3 },
    ['Ahem! Professor Finnegan, marine biologist. Your catches have caught my eye.',
      'I am writing the definitive encyclopedia of these waters. Help me log 8 different species!'],
    ['Splendid! Eight entries! I shall name a footnote after you.']),
  Q('coral', 'coralia', 'Visit the Coral Kingdom', { kind: 'visit', zone: 'coral' }, { money: 150, pearls: 2 },
    ['*A shimmering voice drifts over the water*', 'Surface-dweller... I am Coralia, Queen of the Reef. Sail north-east and visit my kingdom.'],
    ['Welcome to the Coral Kingdom! Mind the box jellies. They are... not royalty.']),
  Q('angel', 'coralia', 'Catch 2 Queen Angelfish', { kind: 'catch', n: 2, species: 'angel' }, { money: 400, pearls: 3 },
    ['My royal guard, the Queen Angelfish, have grown lazy. Catch two of them. It builds character.'],
    ['Ha! That will teach them. You have my royal gratitude, surface-dweller.']),
  Q('depth', 'finn', 'Dive your lure to 100m', { kind: 'depth', meters: 100 }, { money: 600, pearls: 3 },
    ['The truly fascinating specimens live in the dark. Get your lure 100 meters down. Upgrade your rod if you must!'],
    ['A hundred meters! The pressure! The darkness! Marvelous.']),
  Q('king', 'marta', 'Defeat the King Grouper', { kind: 'boss', species: 'kinggrouper' }, { money: 1000, pearls: 5 },
    ["There's a grouper in the shallows so big and grumpy he wears a crown. The King Grouper.",
      'Buy some Boss Bait from my Supplies, press 5 to arm it, and cast in the Sunny Shallows.',
      'When he pulls left, steer right. When he surges - LET GO. Good luck, sprout!'],
    ['You beat the King! I haven\'t seen a fish that size since my honeymoon. Long story.']),
  Q('sword', 'finn', 'Catch a Swordfish in the Deep Blue', { kind: 'catch', n: 1, species: 'swordfish' }, { money: 1500, pearls: 4 },
    ['The Deep Blue, south of the harbor, hides the Swordfish. Fast, proud, pointy. I need one.'],
    ['En garde, indeed! A magnificent specimen.']),
  Q('ice', 'marta', 'Buy the Ice Breaker hull', { kind: 'upgrade', track: 'hull', tier: 1 }, { money: 1000, pearls: 3 },
    ["Up north the sea freezes solid. You'll need an Ice Breaker hull to get through. I happen to sell those."],
    ['Frostbite Fjord awaits! Bring a scarf.']),
  Q('aurora', 'finn', 'Catch an Aurora Ray at night', { kind: 'catch', n: 1, species: 'auroraray' }, { money: 4000, pearls: 5, cosmetic: 'pet-penguin' },
    ['In the fjord, at night, rays glow like the northern lights. The Aurora Ray! Only at night, mind you.'],
    ['Breathtaking! Oh, and a penguin followed you back. He seems to have adopted you. Congratulations?']),
  Q('candy', 'sludge', 'Catch 6 fish in the Candy Lagoon', { kind: 'catch', n: 6, zone: 'candy' }, { money: 8000, pearls: 5 },
    ["Heh heh heh... I'm Dr. Sludge. I study... mutations.", 'East of here the sea turned to sugar. Bring me six samples from the Candy Lagoon. For science!'],
    ['Delicious. I mean, fascinating. Now, the real work begins...']),
  Q('mutant', 'sludge', 'Catch a Golden Mutant', { kind: 'catch', n: 1, species: 'goldenmutant' }, { money: 30000, pearls: 8 },
    ['My old factory leaked a little. A LITTLE. Now there\'s a fish in Toxic Sludge Bay that mutated into pure gold.', 'Get a Hazmat hull and catch me a Golden Mutant!'],
    ['GOLD! I knew those barrels were a good investment!']),
  Q('magma', 'marta', 'Catch 5 fish in the Magma Rift', { kind: 'catch', n: 5, zone: 'magma' }, { money: 40000, pearls: 5 },
    ['West of the harbor, the volcano boils the sea. I hear the fish there come pre-cooked. Catch me five.'],
    ["Spicy! I'll put these on the menu."]),
  Q('storm', 'barnacle', 'Catch 5 fish during a storm', { kind: 'catch', n: 5, storm: true }, { money: 80000, pearls: 6, cosmetic: 'pet-parrot' },
    ["YARR! Captain Barnacle, at yer service. Well. What's left of me.",
      'Storm Reach up north never stops raging. Prove ye have sea legs: catch five fish in a storm!'],
    ["Shiver me timbers, ye've got guts! Take Polly here. She's been a ghost's parrot too long."]),
  Q('doubloon', 'barnacle', 'Bring 3 Doubloon Fish', { kind: 'catch', n: 3, species: 'doubloon' }, { money: 120000, pearls: 6 },
    ["Me crew sank in the Pirate's Graveyard with all our gold. Now the fish swallowed it. Bring me three Doubloon Fish!"],
    ['Me treasure! Well, some of it. It\'s a start!']),
  Q('ghostwhale', 'barnacle', 'Defeat the Ghost Whale', { kind: 'boss', species: 'ghostwhale' }, { money: 300000, pearls: 10, cosmetic: 'pet-ghost' },
    ['The Ghost Whale sank me ship three hundred years ago. It still haunts the graveyard.', 'Use Boss Bait there and give it a fight it won\'t forget!'],
    ["Ye did it! Me soul feels lighter. Take this little spook - he's a good lad."]),
  Q('koi', 'coralia', "Catch Poseidon's Koi", { kind: 'catch', n: 1, species: 'poseidonkoi' }, { money: 600000, pearls: 10 },
    ["Far to the south lies Sunken Atlantis, my ancestors' city. Poseidon's own Koi still swims there.", 'Bring it to me. It would mean everything to my people.'],
    ['The Koi of Poseidon... You are a true hero of the sea.']),
  Q('temple', 'stranger', 'Reach the Drowned Temple', { kind: 'visit', zone: 'temple' }, { money: 300000, pearls: 6 },
    ['...', 'You hear it too, don\'t you? The humming. From below.', 'South-west, beyond the fog, there is a temple. Go. It is expecting you.'],
    ['It knows your name now.']),
  Q('cthulhu', 'stranger', "Defeat Cthulhu's Cousin", { kind: 'boss', species: 'cthulhucousin' }, { money: 2000000, pearls: 15 },
    ['Something sleeps beneath the temple. Not the famous one. His cousin. Wake it. Defeat it.'],
    ['The humming has stopped... no. It has moved. Further. Into the stars.']),
  Q('void', 'stranger', 'Enter The Void', { kind: 'visit', zone: 'void' }, { money: 1000000, pearls: 10 },
    ['At the edge of the world, the ocean pours into the sky. The Void. You will need a Void Anchor.'],
    ['You feel very small. That is normal. Everyone does, here.']),
  Q('final', 'stranger', 'Defeat the World Eater', { kind: 'boss', species: 'worldeater' }, { money: 10000000, pearls: 50, cosmetic: 'pet-alien' },
    ['The World Eater swims in the Void. It has swallowed galaxies. It is swimming towards our sea.', 'Only an angler can stop it. Only you.'],
    ['...', 'It is over. The humming is gone. The sea is safe.', 'Thank you, angler. You are the Legend of the Sea.'], 'teaser'),

  // ================================================================ Chapter II: Jurassic Tides
  Q('rift', 'stranger', 'Buy the Chrono Hull', { kind: 'upgrade', track: 'hull', tier: 10 }, { money: 2000000, pearls: 10 },
    ['...It is not over.', 'When the World Eater died, it tore a hole in the sky above The Void. A rift.', 'Things are coming through. Old things.',
      'Buy a Chrono Hull. Sail into the rift. Do not be afraid.'],
    ['The rift hums like a tuning fork. It knows you now.']),
  Q('jurassic', 'rex', 'Cross the rift into Jurassic Tides', { kind: 'realm', realm: 'jurassic' }, { money: 1500000, pearls: 8 },
    ['GREAT SCOTT! A fisher! Dr. Rex Rexington, chronobiologist. I fell through that rift on my lunch break.', "It's been... 66 million years.",
      'The rift is in The Void, south-east of your harbor. Sail straight into it and meet me on the other side. Bring snacks!'],
    ["Welcome to the Cretaceous! Don't pet anything. Especially the cute ones."]),
  Q('primordial', 'rex', 'Catch 10 fish in the Primordial Sea', { kind: 'catch', n: 10, zone: 'jopen' }, { money: 3000000, pearls: 8 },
    ['These waters are full of species science thinks are extinct. Catch ten for my notes!', 'Oh, and the fish here want fancier bait. Dino Nuggets, specifically.'],
    ['Ammonites! Trilobites! I could cry. I am crying.']),
  Q('nessie', 'rex', 'Catch Nessie in Fern Lagoon', { kind: 'catch', n: 1, species: 'nessie' }, { money: 8000000, pearls: 10 },
    ['Legends say a long-necked beast lives in Fern Lagoon, north-east of base camp.', 'Everyone back home thinks she is in Scotland. Prove them wrong!'],
    ['NESSIE! She is real! She is beautiful! She is trying to eat my hat!']),
  Q('rexmax', 'rex', 'Defeat Rex Maximus', { kind: 'boss', species: 'rexmaximus' }, { money: 15000000, pearls: 15 },
    ['Bad news. The king of Fern Lagoon has noticed us. Rex Maximus.', 'Tiny fins. Enormous jaws. Unlimited anger. Boss Bait works on him too.'],
    ['You beat a dinosaur. With a fishing rod. I am writing a paper about this.']),
  Q('chicxulub', 'rex', 'Defeat Chicxulub in the Extinction Crater', { kind: 'boss', species: 'chicxulub' }, { money: 40000000, pearls: 20 },
    ['The meteor that ends this era is not a meteor. It is a FISH. Chicxulub. It lives in the Extinction Crater.', 'Defeat it and the dinosaurs might just survive!'],
    ['The sky is clearing! History is... well, history is going to be VERY different.', 'Something else fell through the crater. Another rift. It smells of sulfur.']),

  // ================================================================ Chapter III: The Shattered Expanse
  Q('shattered', 'vex', 'Cross into the Shattered Expanse', { kind: 'realm', realm: 'shattered' }, { money: 30000000, pearls: 12 },
    ['*sniff* ... You smell of dinosaurs and ambition. I am Vex. I hunt demons. With a fishing rod.',
      'The rift in the Extinction Crater leads to my world. What is left of it. You will need a Fel-Warded Hull.'],
    ['Welcome to the Shattered Expanse. Mind the floating rocks. They mind you.']),
  Q('pitlord', 'vex', 'Defeat The Pit Lord', { kind: 'boss', species: 'pitlord' }, { money: 60000000, pearls: 15 },
    ['Beneath Hellfire Shallows a Pit Lord has been chained for ten thousand years. The chains are rusting.', 'Finish what the chains started.'],
    ['*sniff* ... He smells defeated. Good.']),
  Q('islandturtle', 'vex', 'Catch an Island Turtle in the Nether Drift', { kind: 'catch', n: 1, species: 'islandturtle' }, { money: 90000000, pearls: 15 },
    ['In the Nether Drift, turtles carry whole islands on their backs. I want one. For... reasons.'],
    ['A tiny island with a tiny tree. It is perfect. I will call it Home.']),
  Q('gatelord', 'vex', 'Defeat the Lord of the Black Gate', { kind: 'boss', species: 'gatelord' }, { money: 250000000, pearls: 25 },
    ['The Black Gate is opening wider. Something on the other side is pushing. Its herald guards the gate.',
      'Defeat the Lord of the Black Gate. I will hold your coffee.'],
    ['It is done. The gate is quiet.', '...but look up. The moon of this world just... moved. Another rift. Beyond the gate.']),

  // ================================================================ Chapter IV: Selene
  Q('selene', 'nova', 'Cross into Selene', { kind: 'realm', realm: 'selene' }, { money: 200000000, pearls: 15 },
    ['This is Commander Nova of the SS Tackle Box. We detected a fisher-shaped anomaly passing through the Black Gate.',
      'Beyond it is Selene: a moon with an ocean. Buy a Vacuum-Sealed Hull and come on up. Gravity is optional.'],
    ["Welcome to Selene! Jump if you like. Everyone does. Once."]),
  Q('tranquility', 'nova', 'Catch 12 fish in the Sea of Tranquility', { kind: 'catch', n: 12, zone: 'tranquil' }, { money: 400000000, pearls: 15 },
    ['Our lander set down in the Sea of Tranquility. We need samples. Twelve of them. For science and for dinner.'],
    ['Excellent haul! The crew is thrilled. The cook is confused.']),
  Q('moonkraken', 'nova', 'Defeat the Moon Kraken', { kind: 'boss', species: 'moonkraken' }, { money: 900000000, pearls: 20 },
    ['Something in Tranquility keeps stealing our landers. It has eight arms and a collection.', 'Get our lander back. Defeat the Moon Kraken!'],
    ['Lander recovered! Slightly chewed. Totally fine.']),
  Q('darksidething', 'nova', 'Defeat the Thing on the Dark Side', { kind: 'boss', species: 'darksidething' }, { money: 2000000000, pearls: 25 },
    ['We have lost contact with our Dark Side relay. The last transmission was just... humming.', 'Go and find out what rises when the Earth sets.'],
    ['Signal restored. And... we are picking up music. From another rift. Is that... synthwave?']),

  // ================================================================ Chapter V: The Neon Dimension
  Q('neon', 'synthia', 'Cross into the Neon Dimension', { kind: 'realm', realm: 'neon' }, { money: 1500000000, pearls: 20 },
    ['YO! DJ Synthia here, broadcasting LIVE from the Neon Dimension!', "Your fishing is totally RAD. Grab a Chrome Chassis and slide through the rift on Selene's Dark Side!"],
    ['Welcome to the GRID, baby! Everything is purple and it is BEAUTIFUL.']),
  Q('arcadehaul', 'synthia', 'Catch 15 fish in Arcade Reef', { kind: 'catch', n: 15, zone: 'arcade' }, { money: 3000000000, pearls: 20 },
    ['Arcade Reef is the high score capital of the grid. Show the leaderboard who is boss. Fifteen fish, go go go!'],
    ['NEW HIGH SCORE! Enter your initials! ...Three letters only, sorry.']),
  Q('kongcrab', 'synthia', 'Defeat the Kong Crab', { kind: 'boss', species: 'kongcrab' }, { money: 6000000000, pearls: 25 },
    ['A giant crab is throwing barrels at my stage! Totally uncool. Take it down!'],
    ['The crowd goes WILD!']),
  Q('kernelpanic', 'synthia', 'Defeat KERNEL PANIC', { kind: 'boss', species: 'kernelpanic' }, { money: 12000000000, pearls: 30 },
    ['Uh oh. The Glitch is spreading. Something called KERNEL PANIC is crashing the whole dimension.', 'Reboot it. With your fishing rod. Please hurry, my mixtape is corrupting.'],
    ['System restored!', "...wait. The Glitch left a hole in the grid. And through it, there's nothing. Nothing but a mouth."]),

  // ================================================================ Chapter VI: The Cosmic Maw
  Q('maw', 'stranger', 'Enter the Cosmic Maw', { kind: 'realm', realm: 'maw' }, { money: 10000000000, pearls: 25 },
    ['You have crossed five worlds.', 'They were all drifting towards the same place. The Maw.', 'It is hungry. It has always been hungry.',
      'Buy a Gravity Anchor. Sail through the Glitch. Come.'],
    ['This is the end of the ocean. Look up. It is looking back.']),
  Q('suneater', 'stranger', 'Defeat the Sun Eater', { kind: 'boss', species: 'suneater' }, { money: 30000000000, pearls: 30 },
    ['On the Accretion Rim, a creature feeds on dying stars. The Sun Eater.', 'It is the Maw\'s herald. Silence it.'],
    ['The stars on the rim are shining again.', 'Now there is only one left.']),
  Q('devourer', 'stranger', 'Defeat THE DEVOURER', { kind: 'boss', species: 'devourer' }, { money: 100000000000, pearls: 100 },
    ['In the heart of the Maw swims THE DEVOURER.', 'It ate the World Eater\'s ancestors. It ate the old gods. It is about to eat everything you love.',
      'Get an Event Horizon Hull. Get Boss Bait. Get ready.', 'Only an angler can stop it. It was always going to be you.'],
    ['...', 'The Maw is closing. The realms are drifting apart again, safe.', 'Every fisher, in every realm, will tell stories about you.',
      'I was once an angler too, you know. A long time ago.', 'Go home. Marta has coffee on.'], 'finale'),
];

export const questById = new Map(QUESTS.map((q) => [q.id, q]));
