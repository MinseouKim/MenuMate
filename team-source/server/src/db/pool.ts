import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import { dbConnectionOptions } from "./connection.js";

/**
 * mysql2/promise 커넥션 풀. ORM을 쓰지 않고, repositories/* 에서 이 풀로 직접 파라미터 바인딩 쿼리를 실행한다.
 */
export function createPool(): mysql.Pool {
  return mysql.createPool({
    ...dbConnectionOptions(),
    connectionLimit: env.DB_CONNECTION_LIMIT,
    namedPlaceholders: false,
    dateStrings: true,
  });
}

let sharedPool: mysql.Pool | null = null;

/** 애플리케이션 전역에서 공유하는 기본 풀 (요청마다 새로 만들지 않는다). */
export function getPool(): mysql.Pool {
  if (!sharedPool) {
    sharedPool = createPool();
  }
  return sharedPool;
}

export async function closePool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = null;
  }
}

export type DbPool = mysql.Pool;
