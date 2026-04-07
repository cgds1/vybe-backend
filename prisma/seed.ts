import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const users = [
  {
    email: 'alex@vybe.com',
    displayName: 'Alex Torres',
    age: 24,
    bio: 'Music lover and weekend hiker. Always up for a good playlist recommendation.',
    interests: ['music', 'hiking', 'travel'],
  },
  {
    email: 'sofia@vybe.com',
    displayName: 'Sofía Ramírez',
    age: 22,
    bio: 'Art student with a passion for street photography and specialty coffee.',
    interests: ['photography', 'art', 'coffee'],
  },
  {
    email: 'marco@vybe.com',
    displayName: 'Marco Bianchi',
    age: 28,
    bio: 'Foodie and amateur chef. I will cook for you if you bring the wine.',
    interests: ['cooking', 'wine', 'cycling'],
  },
  {
    email: 'luna@vybe.com',
    displayName: 'Luna Park',
    age: 25,
    bio: 'Yoga instructor and plant mom. Looking for someone who loves sunsets.',
    interests: ['yoga', 'nature', 'wellness'],
  },
  {
    email: 'daniel@vybe.com',
    displayName: 'Daniel Osei',
    age: 30,
    bio: 'Software engineer by day, jazz drummer by night. Big fan of board games.',
    interests: ['music', 'tech', 'board games'],
  },
  {
    email: 'camila@vybe.com',
    displayName: 'Camila Vega',
    age: 21,
    bio: 'Bookworm and aspiring novelist. Tea > coffee, always.',
    interests: ['reading', 'writing', 'tea'],
  },
  {
    email: 'ethan@vybe.com',
    displayName: 'Ethan Moore',
    age: 27,
    bio: 'Rock climber and van-life enthusiast. The mountains are calling.',
    interests: ['climbing', 'travel', 'outdoors'],
  },
  {
    email: 'priya@vybe.com',
    displayName: 'Priya Nair',
    age: 26,
    bio: 'UX designer passionate about accessibility. Also obsessed with Bollywood.',
    interests: ['design', 'movies', 'dancing'],
  },
  {
    email: 'leo@vybe.com',
    displayName: 'Leo Fernández',
    age: 23,
    bio: 'Skateboarder and graphic designer. I quote movies way too often.',
    interests: ['skateboarding', 'design', 'movies'],
  },
  {
    email: 'nadia@vybe.com',
    displayName: 'Nadia Kuznetsova',
    age: 29,
    bio: 'Marine biologist and freediver. Oceans are my happy place.',
    interests: ['diving', 'nature', 'travel'],
  },
];

async function main() {
  console.log('Seeding database...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    await prisma.user.create({
      data: {
        email: u.email,
        password: hashedPassword,
        profile: {
          create: {
            displayName: u.displayName,
            age: u.age,
            bio: u.bio,
            interests: u.interests,
            avatarUrl: `https://i.pravatar.cc/400?img=${i + 1}`,
          },
        },
      },
    });
    console.log(`  ✓ Created user: ${u.displayName}`);
  }

  console.log(`\nSeeding complete — ${users.length} users created.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
