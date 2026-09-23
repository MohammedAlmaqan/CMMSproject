import { prisma } from '../../backend/src/utils/prisma.js';

async function main() {
  const sql = process.argv[2];
  if (!sql) {
    console.error('no sql');
    process.exit(1);
  }
  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(sql);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }
  console.log(JSON.stringify(rows ?? []));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});