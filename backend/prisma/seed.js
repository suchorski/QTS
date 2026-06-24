import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcryptjs from "bcryptjs";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting database seed...");

  const initialUserCpf = process.env.INITIAL_USER_CPF?.trim();
  if (!initialUserCpf) {
    throw new Error("INITIAL_USER_CPF is required to run seed");
  }

  // Criar OM
  const omPama = await prisma.militaryOrganization.upsert({
    where: { acronym: "PAMA-LS" },
    update: {},
    create: {
      acronym: "PAMA-LS",
      active: true,
    },
  });

  console.log("✓ Military organization created:", omPama.acronym);

  // Criar Posto/Graduação (Rank)
  const ranks = [
    { acronym: "S2", reducedName: "S2", name: "Soldado" },
    { acronym: "S1", reducedName: "S1", name: "Soldado" },
    { acronym: "CB", reducedName: "CB", name: "Cabo" },
    { acronym: "3S", reducedName: "3º SGT", name: "Terceiro Sargento" },
    { acronym: "2S", reducedName: "2º SGT", name: "Segundo Sargento" },
    { acronym: "1S", reducedName: "1º SGT", name: "Primeiro Sargento" },
    { acronym: "SO", reducedName: "SO", name: "Suboficial" },
    { acronym: "2T", reducedName: "2º Ten", name: "Segundo Tenente" },
    { acronym: "1T", reducedName: "1º Ten", name: "Primeiro Tenente" },
    { acronym: "CP", reducedName: "Cap", name: "Capitão" },
    { acronym: "MJ", reducedName: "Maj", name: "Major" },
    { acronym: "TC", reducedName: "Ten Cel", name: "Tenente Coronel" },
    { acronym: "CL", reducedName: "Cel", name: "Coronel" },
    { acronym: "BR", reducedName: "Brig", name: "Brigadeiro" },
    { acronym: "MB", reducedName: "Maj Brig", name: "Major Brigadeiro" },
    { acronym: "TB", reducedName: "Ten Brig", name: "Tenente Brigadeiro" },
  ];

  const rankIds = {};

  for (const rank of ranks) {
    const r = await prisma.rank.upsert({
      where: { acronym: rank.acronym },
      update: {},
      create: rank,
    });
    rankIds[rank.acronym] = r.id;
    console.log(`✓ Rank created: ${r.acronym}`);
  }

  // Criar Perfis (Roles)
  const roles = [
    {
      code: "admin_global",
      name: "Administrador Global",
      description: "Acesso total ao sistema",
    },
    {
      code: "admin_local",
      name: "Administrador Local",
      description: "Acesso administrativo na OM",
    },
    {
      code: "editor",
      name: "Editor",
      description: "Pode criar e editar conteúdo",
    },
    {
      code: "validador",
      name: "Validador",
      description: "Pode validar conteúdo",
    },
    {
      code: "aprovador",
      name: "Aprovador",
      description: "Pode aprovar conteúdo",
    },
    {
      code: "invalidar_qts",
      name: "Invalidar QTS",
      description: "Pode invalidar QTS aprovados",
    },
    {
      code: "historico_qts",
      name: "Histórico de QTS",
      description: "Pode acessar o histórico arquivado de QTS",
    },
  ];

  const roleIds = {};

  for (const role of roles) {
    const r = await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
    roleIds[role.code] = r.id;
    console.log(`✓ Role created: ${r.name}`);
  }

  // Criar usuário inicial
  const passwordHash = await bcryptjs.hash("inicial123!", 10);

  const initialUser = await prisma.user.upsert({
    where: { cpf: initialUserCpf },
    update: {},
    create: {
      cpf: initialUserCpf,
      name: "Seu Nome Completo",
      warName: "Suchorski",
      passwordHash,
      rankId: rankIds["1S"],
      militaryOrganizationId: omPama.id,
      active: true,
    },
  });

  console.log("✓ User created:", initialUser.cpf);

  // Associar perfil Admin Global ao usuário
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: initialUser.id,
        roleId: roleIds.admin_global,
      },
    },
    update: {},
    create: {
      userId: initialUser.id,
      roleId: roleIds.admin_global,
    },
  });

  console.log("✓ Global Admin role assigned to user");

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Erro durante seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
