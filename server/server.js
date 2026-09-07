require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("JWT_SECRET is missing from .env");
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({ storage });


// ============================================================
// AUTHENTICATION
// ============================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Authorization token required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}


// ============================================================
// HOME
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message: "Play School API is running",
  });
});


// ============================================================
// LOGIN
// ============================================================

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const [teachers] = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        password,
        role
      FROM teachers
      WHERE email = ?
      `,
      [email]
    );

    if (teachers.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const teacher = teachers[0];

    let passwordValid = false;

    if (teacher.password.startsWith("$2")) {
      passwordValid = await bcrypt.compare(
        password,
        teacher.password
      );
    } else {
      passwordValid = password === teacher.password;
    }

    if (!passwordValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
      },
      JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    res.json({
      message: "Login successful",

      token,

      user: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Login failed",
    });
  }
});


// ============================================================
// GET ALL 9 DIVISIONS
// ============================================================

app.get(
  "/api/my-divisions",
  authenticateToken,
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          d.id,
          d.standard,
          d.division,
          d.teacher_id,
          t.name AS teacher_name
        FROM divisions d
        LEFT JOIN teachers t
          ON d.teacher_id = t.id
        ORDER BY
          CASE
            WHEN d.standard = 'Nursery' THEN 1
            WHEN d.standard = 'LKG' THEN 2
            WHEN d.standard = 'UKG' THEN 3
            ELSE 4
          END,
          d.division
        `
      );

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to load divisions",
      });
    }
  }
);


// ============================================================
// GET STUDENTS
// ============================================================

app.get(
  "/api/my-students",
  authenticateToken,
  async (req, res) => {
    try {
      let query;
      let params = [];

      if (req.user.role === "PRINCIPAL") {
        query = `
          SELECT
            s.id,
            s.name,
            d.id AS division_id,
            d.standard,
            d.division,
            d.teacher_id
          FROM students s
          JOIN divisions d
            ON s.division_id = d.id
          ORDER BY
            CASE
              WHEN d.standard = 'Nursery' THEN 1
              WHEN d.standard = 'LKG' THEN 2
              WHEN d.standard = 'UKG' THEN 3
              ELSE 4
            END,
            d.division,
            s.name
        `;
      } else {
        query = `
          SELECT
            s.id,
            s.name,
            d.id AS division_id,
            d.standard,
            d.division,
            d.teacher_id
          FROM students s
          JOIN divisions d
            ON s.division_id = d.id
          WHERE d.teacher_id = ?
          ORDER BY
            CASE
              WHEN d.standard = 'Nursery' THEN 1
              WHEN d.standard = 'LKG' THEN 2
              WHEN d.standard = 'UKG' THEN 3
              ELSE 4
            END,
            d.division,
            s.name
        `;

        params = [req.user.id];
      }

      const [rows] = await pool.query(query, params);

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to load students",
      });
    }
  }
);


// ============================================================
// ADD CHILD
// ============================================================

app.post(
  "/api/students",
  authenticateToken,
  async (req, res) => {
    try {
      const { name, division_id } = req.body;

      if (!name || !division_id) {
        return res.status(400).json({
          message: "Child name and division are required",
        });
      }

      const cleanName = name.trim();

      if (!cleanName) {
        return res.status(400).json({
          message: "Child name cannot be empty",
        });
      }

      const [divisions] = await pool.query(
        `
        SELECT
          id,
          standard,
          division,
          teacher_id
        FROM divisions
        WHERE id = ?
        `,
        [division_id]
      );

      if (divisions.length === 0) {
        return res.status(404).json({
          message: "Division not found",
        });
      }

      const division = divisions[0];

      if (
        req.user.role !== "PRINCIPAL" &&
        division.teacher_id !== req.user.id
      ) {
        return res.status(403).json({
          message:
            "You cannot add a child to this division",
        });
      }

      const [result] = await pool.query(
        `
        INSERT INTO students
        (name, division_id)
        VALUES (?, ?)
        `,
        [cleanName, division_id]
      );

      res.status(201).json({
        message: "Child added successfully",

        student: {
          id: result.insertId,
          name: cleanName,
          division_id: division.id,
          standard: division.standard,
          division: division.division,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to add child",
      });
    }
  }
);


// ============================================================
// DELETE CHILD
// ============================================================

app.delete(
  "/api/students/:id",
  authenticateToken,
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const studentId = req.params.id;

      const [students] = await connection.query(
        `
        SELECT
          s.id,
          s.name,
          d.teacher_id
        FROM students s
        JOIN divisions d
          ON s.division_id = d.id
        WHERE s.id = ?
        `,
        [studentId]
      );

      if (students.length === 0) {
        return res.status(404).json({
          message: "Child not found",
        });
      }

      const student = students[0];

      if (
        req.user.role !== "PRINCIPAL" &&
        student.teacher_id !== req.user.id
      ) {
        return res.status(403).json({
          message: "You cannot delete this child",
        });
      }

      await connection.beginTransaction();

      const [activities] = await connection.query(
        `
        SELECT image_url
        FROM activities
        WHERE student_id = ?
        `,
        [studentId]
      );

      await connection.query(
        `
        DELETE FROM activities
        WHERE student_id = ?
        `,
        [studentId]
      );

      await connection.query(
        `
        DELETE FROM students
        WHERE id = ?
        `,
        [studentId]
      );

      await connection.commit();

      for (const activity of activities) {
        if (activity.image_url) {
          const imagePath = path.join(
            __dirname,
            activity.image_url.replace(
              "/uploads/",
              "uploads/"
            )
          );

          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }

      res.json({
        message: "Child deleted successfully",
      });
    } catch (error) {
      await connection.rollback();

      console.error(error);

      res.status(500).json({
        message: "Failed to delete child",
      });
    } finally {
      connection.release();
    }
  }
);


// ============================================================
// ADD ACTIVITY
// ============================================================

app.post(
  "/api/activities",
  authenticateToken,
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        student_id,
        description,
      } = req.body;

      if (!student_id || !description) {
        return res.status(400).json({
          message:
            "Student and description are required",
        });
      }

      const [students] = await pool.query(
        `
        SELECT
          s.id,
          d.teacher_id
        FROM students s
        JOIN divisions d
          ON s.division_id = d.id
        WHERE s.id = ?
        `,
        [student_id]
      );

      if (students.length === 0) {
        return res.status(404).json({
          message: "Student not found",
        });
      }

      const student = students[0];

      if (
        req.user.role !== "PRINCIPAL" &&
        student.teacher_id !== req.user.id
      ) {
        return res.status(403).json({
          message:
            "You cannot add an activity for this student",
        });
      }

      const imageUrl = req.file
        ? `/uploads/${req.file.filename}`
        : null;

      const [result] = await pool.query(
        `
        INSERT INTO activities
        (
          student_id,
          teacher_id,
          description,
          image_url
        )
        VALUES (?, ?, ?, ?)
        `,
        [
          student_id,
          req.user.id,
          description,
          imageUrl,
        ]
      );

      res.status(201).json({
        message: "Activity added successfully",
        activity_id: result.insertId,
        image_url: imageUrl,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to add activity",
      });
    }
  }
);


// ============================================================
// GET ACTIVITY HISTORY
// ============================================================

app.get(
  "/api/activities",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        student_id,
        division_id,
        month,
        from,
        to,
      } = req.query;

      let conditions = [];
      let params = [];

      if (req.user.role !== "PRINCIPAL") {
        conditions.push(
          "d.teacher_id = ?"
        );

        params.push(req.user.id);
      }

      if (student_id) {
        conditions.push("s.id = ?");
        params.push(student_id);
      }

      if (division_id) {
        conditions.push("d.id = ?");
        params.push(division_id);
      }

      if (month) {
        conditions.push(
          "DATE_FORMAT(a.created_at, '%Y-%m') = ?"
        );

        params.push(month);
      }

      if (from) {
        conditions.push(
          "DATE(a.created_at) >= ?"
        );

        params.push(from);
      }

      if (to) {
        conditions.push(
          "DATE(a.created_at) <= ?"
        );

        params.push(to);
      }

      let query = `
        SELECT
          a.id,
          a.description,
          a.image_url,
          a.created_at,

          s.id AS student_id,
          s.name AS student_name,

          d.id AS division_id,
          d.standard,
          d.division,

          t.name AS teacher_name

        FROM activities a

        JOIN students s
          ON a.student_id = s.id

        JOIN divisions d
          ON s.division_id = d.id

        JOIN teachers t
          ON a.teacher_id = t.id
      `;

      if (conditions.length > 0) {
        query +=
          " WHERE " +
          conditions.join(" AND ");
      }

      query +=
        " ORDER BY a.created_at DESC";

      const [rows] = await pool.query(
        query,
        params
      );

      res.json(rows);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to load activities",
      });
    }
  }
);


// ============================================================
// ANALYTICS
// ============================================================

app.get(
  "/api/analytics",
  authenticateToken,
  async (req, res) => {
    try {
      let teacherCondition = "";
      let params = [];

      if (req.user.role !== "PRINCIPAL") {
        teacherCondition =
          "WHERE d.teacher_id = ?";

        params.push(req.user.id);
      }

      const [totalActivities] =
        await pool.query(
          `
          SELECT COUNT(*) AS total
          FROM activities a

          JOIN students s
            ON a.student_id = s.id

          JOIN divisions d
            ON s.division_id = d.id

          ${teacherCondition}
          `,
          params
        );

      const [activityByDivision] =
        await pool.query(
          `
          SELECT
            d.standard,
            d.division,
            COUNT(a.id) AS activity_count

          FROM divisions d

          LEFT JOIN students s
            ON s.division_id = d.id

          LEFT JOIN activities a
            ON a.student_id = s.id

          ${
            req.user.role !== "PRINCIPAL"
              ? "WHERE d.teacher_id = ?"
              : ""
          }

          GROUP BY
            d.id,
            d.standard,
            d.division

          ORDER BY
            CASE
              WHEN d.standard = 'Nursery' THEN 1
              WHEN d.standard = 'LKG' THEN 2
              WHEN d.standard = 'UKG' THEN 3
              ELSE 4
            END,
            d.division
          `,
          req.user.role !== "PRINCIPAL"
            ? [req.user.id]
            : []
        );

      const [activityByStudent] =
        await pool.query(
          `
          SELECT
            s.name,
            d.standard,
            d.division,
            COUNT(a.id) AS activity_count

          FROM students s

          JOIN divisions d
            ON s.division_id = d.id

          LEFT JOIN activities a
            ON a.student_id = s.id

          ${
            req.user.role !== "PRINCIPAL"
              ? "WHERE d.teacher_id = ?"
              : ""
          }

          GROUP BY
            s.id,
            s.name,
            d.standard,
            d.division

          ORDER BY
            activity_count DESC,
            s.name
          `,
          req.user.role !== "PRINCIPAL"
            ? [req.user.id]
            : []
        );

      res.json({
        totalActivities:
          totalActivities[0].total,

        activityByDivision,

        activityByStudent,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to load analytics",
      });
    }
  }
);


// ============================================================
// DELETE ACTIVITY
// ============================================================

app.delete(
  "/api/activities/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const activityId = req.params.id;

      const [activities] =
        await pool.query(
          `
          SELECT
            a.id,
            a.image_url,
            d.teacher_id

          FROM activities a

          JOIN students s
            ON a.student_id = s.id

          JOIN divisions d
            ON s.division_id = d.id

          WHERE a.id = ?
          `,
          [activityId]
        );

      if (activities.length === 0) {
        return res.status(404).json({
          message: "Activity not found",
        });
      }

      const activity = activities[0];

      if (
        req.user.role !== "PRINCIPAL" &&
        activity.teacher_id !== req.user.id
      ) {
        return res.status(403).json({
          message:
            "You cannot delete this activity",
        });
      }

      await pool.query(
        `
        DELETE FROM activities
        WHERE id = ?
        `,
        [activityId]
      );

      if (activity.image_url) {
        const imagePath = path.join(
          __dirname,
          activity.image_url.replace(
            "/uploads/",
            "uploads/"
          )
        );

        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      res.json({
        message:
          "Activity deleted successfully",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message:
          "Failed to delete activity",
      });
    }
  }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT}`
  );
});