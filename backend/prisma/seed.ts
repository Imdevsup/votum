// Local dev seed. Creates a demo eligible user, a demo repo, and one vouch
// so a freshly cloned repo has something to render against.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoUser = await prisma.user.upsert({
    where: { githubLogin: 'votum-demo' },
    update: {},
    create: {
      githubId: BigInt(1),
      githubLogin: 'votum-demo',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
      eligibility: 'auto_eligible',
      eligibilityReason: 'Seeded for local development.',
    },
  });

  const demoRepo = await prisma.repo.upsert({
    where: { fullName: 'sindresorhus/awesome-nodejs' },
    update: {},
    create: {
      githubId: BigInt(99999),
      owner: 'sindresorhus',
      name: 'awesome-nodejs',
      fullName: 'sindresorhus/awesome-nodejs',
      description: 'Delightful Node.js packages and resources',
      language: 'JavaScript',
      stars: 60000,
    },
  });

  await prisma.votum.upsert({
    where: { userId_repoId: { userId: demoUser.id, repoId: demoRepo.id } },
    update: {},
    create: { userId: demoUser.id, repoId: demoRepo.id },
  });

  console.log(`Seeded ${demoUser.githubLogin} → ${demoRepo.fullName}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
