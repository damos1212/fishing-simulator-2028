// The story: a chain of quests told by a cast of oddball characters, from the harbor to The Void.
import type { Rarity } from './fish';
import type { TrackId } from './upgrades';
import type { ZoneId } from './zones';

export type NpcId = 'marta' | 'finn' | 'coralia' | 'sludge' | 'barnacle' | 'stranger';

export interface Npc { name: string; title: string; face: string; color: string }

export const NPCS: Record<NpcId, Npc> = {
  marta: { name: 'Old Marta', title: 'Tackle Shop owner', face: '&#128117;', color: '#ff9a3c' },
  finn: { name: 'Prof. Finnegan', title: 'Marine biologist', face: '&#129489;&#8205;&#128300;', color: '#3a86ff' },
  coralia: { name: 'Queen Coralia', title: 'Ruler of the reef', face: '&#129500;&#8205;&#9792;&#65039;', color: '#ff5aa8' },
  sludge: { name: 'Dr. Sludge', title: 'Definitely a real doctor', face: '&#129514;', color: '#7ad030' },
  barnacle: { name: 'Captain Barnacle', title: 'Ghost pirate', face: '&#128128;', color: '#50c0a0' },
  stranger: { name: 'The Stranger', title: '???', face: '&#128065;&#65039;', color: '#8a5ad0' },
};

export type QuestGoal =
  | { kind: 'catch'; n: number; species?: string; zone?: ZoneId; rarity?: Rarity; storm?: boolean; night?: boolean }
  | { kind: 'sell'; amount: number }
  | { kind: 'upgrade'; track: TrackId; tier: number }
  | { kind: 'visit'; zone: ZoneId }
  | { kind: 'dex'; n: number }
  | { kind: 'depth'; meters: number }
  | { kind: 'boss'; species: string };

export interface Quest {
  id: string;
  npc: NpcId;
  title: string;
  goal: QuestGoal;
  intro: string[];
  outro: string[];
  reward: { money: number; pearls: number; cosmetic?: string };
}

const Q = (id: string, npc: NpcId, title: string, goal: QuestGoal, reward: Quest['reward'], intro: string[], outro: string[]): Quest =>
  ({ id, npc, title, goal, reward, intro, outro });

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
    ['...', 'It is over. The humming is gone. The sea is safe.', 'Thank you, angler. You are the Legend of the Sea.']),
];

export const questById = new Map(QUESTS.map((q) => [q.id, q]));
