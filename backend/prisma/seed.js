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

  // Criar Uniformes
  const uniforms = [
    { uniform: "1º", description: "Gala", usages: 0 },
    { uniform: "2º A", description: "Rigor (branco)", usages: 0 },
    { uniform: "2º B", description: "Passeio Completo (branco)", usages: 0 },
    { uniform: "3º A", description: "Rigor (azul)", usages: 0 },
    { uniform: "3º B", description: "Passeio Completo (azul)", usages: 0 },
    { uniform: "4º A", description: "Rigor", usages: 0 },
    { uniform: "4º B", description: "Rigor", usages: 0 },
    { uniform: "4º C", description: "Rigor", usages: 0 },
    { uniform: "5º A", description: "Passeio Completo", usages: 0 },
    { uniform: "5º B", description: "Passeio Completo", usages: 0 },
    { uniform: "6º A", description: "Passeio", usages: 0 },
    { uniform: "6º B", description: "Serviço Administrativo", usages: 0 },
    { uniform: "7º A", description: "Passeio", usages: 0 },
    { uniform: "7º B", description: "Serviço Administrativo", usages: 0 },
    { uniform: "7º C", description: "Passeio", usages: 0 },
    { uniform: "7º D", description: "Serviço Administrativo", usages: 0 },
    { uniform: "7º E", description: "Serviço Administrativo", usages: 0 },
    { uniform: "8º", description: "Voo", usages: 0 },
    { uniform: "9º A", description: "Educação Física / Atividade Desportiva", usages: 0 },
    { uniform: "9º B", description: "Educação Física / Atividade Desportiva", usages: 0 },
    {
      uniform: "10º",
      description: "Campanha, Serviço e Instrução Militar (camuflado)",
      usages: 0,
    },
    { uniform: "11º A", description: "Instrução Militar", usages: 0 },
    { uniform: "11º B", description: "Manutenção e Conservação", usages: 0 },
    { uniform: "11º C", description: "Limpeza", usages: 0 },
    { uniform: "12º A", description: "Refeitório", usages: 0 },
    { uniform: "12º B", description: "Comissaria", usages: 0 },
    { uniform: "12º C", description: "Comissaria de Bordo", usages: 0 },
    { uniform: "12º D", description: "Subsistência", usages: 0 },
    { uniform: "13º", description: "Saúde (hospitalar)", usages: 0 },
    { uniform: "14º A", description: "Hotelaria", usages: 0 },
    { uniform: "14º B", description: "Condução de Viaturas", usages: 0 },
    { uniform: "14º C", description: "Barbearia", usages: 0 },
    { uniform: "15º", description: "Motociclista Batedor", usages: 0 },
    { uniform: "16º A", description: "Desfile Militar", usages: 0 },
    { uniform: "16º B", description: "Desfile Militar", usages: 0 },
    { uniform: "16º C", description: "Desfile Militar", usages: 0 },
    { uniform: "17º A", description: "Guarda de Honra", usages: 0 },
    { uniform: "17º B", description: "Guarda de Honra", usages: 0 },
    { uniform: "17º C", description: "Guarda de Honra", usages: 0 },
  ];

  for (const item of uniforms) {
    const u = await prisma.uniform.upsert({
      where: { uniform: item.uniform },
      update: {},
      create: item,
    });
    console.log(`✓ Uniform created: ${u.uniform}`);
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
