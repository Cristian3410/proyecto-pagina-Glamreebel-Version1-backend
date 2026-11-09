import { Pool } from "pg";

export const pool = new Pool({
    user: "postgres",
    database: "db_tienda_maquillaje",
    password: "123456", 
    port: 5432,
    host: "127.0.0.1",
    ssl:false
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error("Error al conectar con PostgreSQL:", err.stack);
    }
    console.log("Conectado exitosamente a la base de datos PostgreSQL");
    release();
});