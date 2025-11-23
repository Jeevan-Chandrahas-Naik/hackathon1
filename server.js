const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // ✅ only once

// MySQL connection pool
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',              // change if needed
  password: 'JeevanCN@039',  // your MySQL password
  database: 'campus_events'
});

// Test DB connection
db.getConnection()
  .then(() => console.log('✅ Connected to MySQL'))
  .catch((err) => {
    console.error('❌ Error connecting to MySQL:', err);
    process.exit(1);
  });

/**
 * Helper: convert "YYYY-MM-DDTHH:MM" (from <input type="datetime-local">)
 * to "YYYY-MM-DD HH:MM:SS" for MySQL
 */
function convertToMySQLDateTime(input) {
  if (!input) return null;
  const withSpace = input.replace('T', ' ');
  return withSpace + ':00';
}

// ============= API ROUTES ============= //

// 1) Get all events
app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM events ORDER BY event_datetime ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ message: 'Error fetching events' });
  }
});

// 2) Create new event (Admin)
app.post('/api/events', async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      event_datetime,
      venue,
      reg_limit
    } = req.body;

    if (!title || !event_datetime || !venue) {
      return res
        .status(400)
        .json({ message: 'title, event_datetime, and venue are required' });
    }

    const mysqlDateTime = convertToMySQLDateTime(event_datetime);

    const [result] = await db.query(
      `INSERT INTO events (title, description, category, event_datetime, venue, reg_limit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        title,
        description || '',
        category || 'Other',
        mysqlDateTime,
        venue,
        reg_limit || 0
      ]
    );

    res.status(201).json({ message: 'Event created', eventId: result.insertId });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ message: 'Error creating event' });
  }
});

// 3) Register student for an event
app.post('/api/events/:id/register', async (req, res) => {
  const eventId = req.params.id;
  const { student_name, student_email, department, year } = req.body;


  if (!student_name || !student_email) {
    return res
      .status(400)
      .json({ message: 'student_name and student_email are required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Check event exists
    const [events] = await connection.query(
      'SELECT * FROM events WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Event not found' });
    }

    const event = events[0];

    // Check registration limit
    if (event.reg_limit > 0) {
      const [countRows] = await connection.query(
        'SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?',
        [eventId]
      );

      const currentCount = countRows[0].count;

      if (currentCount >= event.reg_limit) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: 'Registration limit reached for this event' });
      }
    }

  // Insert registration (with department + year)
await connection.query(
  `INSERT INTO registrations (
      event_id,
      student_name,
      student_email,
      department,
      year
    )
   VALUES (?, ?, ?, ?, ?)`,
  [eventId, student_name, student_email, department || null, year || null]
);


    await connection.commit();
    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    await connection.rollback();
    console.error('Error registering:', err);
    res.status(500).json({ message: 'Error registering for event' });
  } finally {
    connection.release();
  }
});// 4) Mark attendance for an event (QR check-in)
app.post('/api/events/:id/checkin', async (req, res) => {
  const eventId = req.params.id;
  const { student_email } = req.body;

  if (!student_email) {
    return res.status(400).json({ message: 'student_email is required' });
  }

  try {
    // Check event exists
    const [events] = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (events.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Optional: check if registration exists (you can skip this if not needed)
    const [regs] = await db.query(
      'SELECT * FROM registrations WHERE event_id = ? AND student_email = ?',
      [eventId, student_email]
    );
    if (regs.length === 0) {
      // You can either block or still allow; here we allow but warn
      console.warn('Check-in without prior registration:', eventId, student_email);
    }

    // Check if already checked in
    const [existing] = await db.query(
      'SELECT * FROM attendance WHERE event_id = ? AND student_email = ?',
      [eventId, student_email]
    );
    if (existing.length > 0) {
      return res.status(200).json({ message: 'Already marked present for this event' });
    }

    // Insert attendance
    await db.query(
      'INSERT INTO attendance (event_id, student_email) VALUES (?, ?)',
      [eventId, student_email]
    );

    res.status(201).json({ message: 'Attendance marked successfully' });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ message: 'Error marking attendance' });
  }
});
// 👉 Host: get attendance list
app.get('/api/events/:id/attendance', async (req, res) => {
  try {
    const eventId = req.params.id;
    const [rows] = await db.query(
      'SELECT student_email, checked_in_at FROM attendance WHERE event_id = ?',
      [eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ message: 'Error fetching attendance' });
  }
});

// 4) Get participants of an event (Admin)
app.get('/api/events/:id/participants', async (req, res) => {
  try {
    const eventId = req.params.id;
      const [rows] = await db.query(
    'SELECT student_name, student_email, department, year, registered_at FROM registrations WHERE event_id = ?',
    [eventId]
  );

    res.json(rows);
  } catch (err) {
    console.error('Error fetching participants:', err);
    res.status(500).json({ message: 'Error fetching participants' });
  }
});
// 5) Delete an event (Admin)
app.delete('/api/events/:id', async (req, res) => {
  const eventId = req.params.id;

  try {
    // First remove registrations for that event
    await db.query('DELETE FROM registrations WHERE event_id = ?', [eventId]);

    // Then delete the event itself
    const [result] = await db.query('DELETE FROM events WHERE id = ?', [eventId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ message: 'Error deleting event' });
  }
});

// Serve frontend

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
