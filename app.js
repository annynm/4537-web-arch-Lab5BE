require("dotenv").config();

const http = require("http");
const { neon } = require("@neondatabase/serverless");

// Use the older version that supports raw SQL
const sql = neon(process.env.DATABASE_URL);

let totalRequests = 0;

const ensurePatientTableOnURL2 = async () => {
  const sql2 = neon(process.env.DATABASE_URL2);

  try {
    // Try to select from the patient table
    await sql2`SELECT * FROM patients LIMIT 0`;
    // If successful, table exists and is accessible
  } catch (error) {
    // If it fails (e.g., table doesn't exist), create the table
    // Optionally check error code for "undefined_table" (42P01) for precision
    console.log(error);
    await sql2`
      CREATE TABLE patients (
        patient_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        dateofbirth DATE NOT NULL
      );
    `;
  }
  await sql2`SELECT * FROM patient LIMIT 0`;
  console.log("try was run");
};

// Security tests
const runSecurityTests = async () => {
  console.log("🔒 Running security tests...");

  try {
    console.log("1. Testing INSERT...");
    await sql(
      `INSERT INTO patient (name, dateofbirth) VALUES ('Arthur Dent', '1978-03-15')`,
    );
    console.log("✅ INSERT successful - Arthur Dent added");
  } catch (error) {
    console.log("❌ INSERT failed:", error.message);
  }

  try {
    console.log("2. Testing SELECT...");
    const patients = await sql(`SELECT * FROM patient`);
    console.log(
      "✅ SELECT successful - Patients in database:",
      patients.length,
    );
    console.log("   Patient list:", patients);
  } catch (error) {
    console.log("❌ SELECT failed:", error.message);
  }

  try {
    console.log("3. Testing DELETE (should fail)...");
    await sql(`DELETE FROM patient WHERE name = 'Arthur Dent'`);
    console.log("❌ DELETE succeeded - THIS SHOULD NOT HAPPEN!");
  } catch (error) {
    console.log("✅ DELETE correctly blocked:", error.message);
  }

  try {
    console.log("4. Testing CREATE TABLE (should fail)...");
    await sql(`CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT)`);
    console.log("❌ CREATE TABLE succeeded - THIS SHOULD NOT HAPPEN!");
  } catch (error) {
    console.log("✅ CREATE TABLE correctly blocked:", error.message);
  }

  try {
    console.log("5. Testing DROP TABLE (should fail)...");
    await sql(`DROP TABLE patient`);
    console.log("❌ DROP TABLE succeeded - THIS SHOULD NOT HAPPEN!");
  } catch (error) {
    console.log("✅ DROP TABLE correctly blocked:", error.message);
  }

  try {
    console.log("6. Testing UPDATE (should fail)...");
    await sqlll(
      `UPDATE patient SET name = 'Ford Prefect' WHERE name = 'Arthur Dent'`,
    );
    console.log("❌ UPDATE succeeded - THIS SHOULD NOT HAPPEN!");
  } catch (error) {
    console.log("✅ UPDATE correctly blocked:", error.message);
  }

  console.log("🔒 Security tests completed!\n");
};

const requestHandler = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  totalRequests += 1;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  await ensurePatientTableOnURL2();

  // API endpoint
  if (path === "/api/v1/sql" || path === "/lab5/api/v1/sql") {
    try {
      // ✅ Check and create table on DATABASE_URL2 before every query
      await ensurePatientTableOnURL2();

      if (req.method === "GET") {
        console.log("running get");
        // Get query from URL parameter
        const query = url.searchParams.get("query");
        if (!query) {
          res.writeHead(400, {
            "Content-Type": "application/json",
            ...corsHeaders,
          });
          res.end(JSON.stringify({ error: "Query parameter is required" }));
          return;
        }

        console.log("Executing:", query);

        // Execute the raw SQL query directly
        const result = await sql(query);

        res.writeHead(200, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(
          JSON.stringify({
            message: `Request #${totalRequests}`,
            data: result,
          }),
        );
      } else if (req.method === "POST") {
        // Handle POST requests
        let body = "";
        req.on("data", (chunk) => (body += chunk.toString()));

        req.on("end", async () => {
          try {
            const { query } = JSON.parse(body);
            if (!query) {
              res.writeHead(400, {
                "Content-Type": "application/json",
                ...corsHeaders,
              });
              res.end(JSON.stringify({ error: "Query is required" }));
              return;
            }

            console.log("Executing:", query);
            const result = await sql(query);

            res.writeHead(200, {
              "Content-Type": "application/json",
              ...corsHeaders,
            });
            res.end(
              JSON.stringify({
                message: `Request #${totalRequests}`,
                result: "Query executed successfully",
                data: result,
              }),
            );
          } catch (error) {
            res.writeHead(400, {
              "Content-Type": "application/json",
              ...corsHeaders,
            });
            res.end(
              JSON.stringify({ error: "Invalid JSON or database error" }),
            );
          }
        });
      } else {
        res.writeHead(405, {
          "Content-Type": "application/json",
          ...corsHeaders,
        });
        res.end(JSON.stringify({ error: "Method not allowed" }));
      }
    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "application/json",
        ...corsHeaders,
      });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  }
};

// Run tests and start server
runSecurityTests().then(() => {
  const server = http.createServer(requestHandler);
  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api/v1/sql`);
    console.log(
      `🔍 Test: http://localhost:${PORT}/api/v1/sql?query=SELECT * FROM patient`,
    );
  });
});
