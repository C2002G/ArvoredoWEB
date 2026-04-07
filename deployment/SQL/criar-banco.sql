-- Arvoredo PDV - Script de Criacao do Banco de Dados
-- Execute este script no pgAdmin para criar o banco de dados

-- 1. Criar usuario (se ainda nao existir)
-- Substitua 'SUA_SENHA' por uma senha forte

-- CREATE USER arvoredo_user WITH PASSWORD 'SUA_SENHA';

-- 2. Criar banco de dados
CREATE DATABASE arvoredo
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    CONNECTION LIMIT = -1;

-- 3. Dar permissao ao usuario (opcional)
-- GRANT ALL PRIVILEGES ON DATABASE arvoredo TO arvoredo_user;

-- 4. Conectar ao banco arvoredo e criar tabelas
-- (Isso sera feito automaticamente pelo script configurar-sistema.ps1)
-- pnpm --filter @workspace/db run push

-- Apos executar este SQL, voce pode fechar o pgAdmin
-- e usar o script de configuracao do sistema.
