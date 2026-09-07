import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000";

function App() {
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user") || "null")
  );
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [students, setStudents] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [activities, setActivities] = useState([]);

  const [selectedStudent, setSelectedStudent] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState(null);

  const [searchStudent, setSearchStudent] = useState("");
  const [searchDivision, setSearchDivision] = useState("");
  const [searchMonth, setSearchMonth] = useState("");

  const [analytics, setAnalytics] = useState(null);
  const [message, setMessage] = useState("");

  // Manage children
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentDivision, setNewStudentDivision] = useState("");

  const loggedIn = Boolean(token && user);

  async function apiFetch(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong");
    }

    return data;
  }

  async function login(event) {
    event.preventDefault();
    setMessage("");

    try {
      const response = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);
  }

  async function loadData() {
    try {
      const [studentData, divisionData] = await Promise.all([
        apiFetch("/api/my-students"),
        apiFetch("/api/my-divisions"),
      ]);

      setStudents(studentData);
      setDivisions(divisionData);

      await loadActivities();
      await loadAnalytics();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadActivities() {
    try {
      const params = new URLSearchParams();

      if (searchStudent) {
        params.append("student_id", searchStudent);
      }

      if (searchDivision) {
        params.append("division_id", searchDivision);
      }

      if (searchMonth) {
        params.append("month", searchMonth);
      }

      const query = params.toString();

      const data = await apiFetch(
        `/api/activities${query ? `?${query}` : ""}`
      );

      setActivities(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadAnalytics() {
    try {
      const data = await apiFetch("/api/analytics");
      setAnalytics(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    if (loggedIn) {
      loadData();
    }
  }, [loggedIn]);

  async function addActivity(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedStudent || !description.trim()) {
      setMessage("Please select a child and enter an activity.");
      return;
    }

    try {
      const formData = new FormData();

      formData.append("student_id", selectedStudent);
      formData.append("description", description);

      if (image) {
        formData.append("image", image);
      }

      await apiFetch("/api/activities", {
        method: "POST",
        body: formData,
      });

      setDescription("");
      setImage(null);
      setSelectedStudent("");

      const imageInput = document.getElementById("imageInput");

      if (imageInput) {
        imageInput.value = "";
      }

      setMessage("Activity saved successfully.");

      await loadActivities();
      await loadAnalytics();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteActivity(id) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this activity?"
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/api/activities/${id}`, {
        method: "DELETE",
      });

      setMessage("Activity deleted successfully.");

      await loadActivities();
      await loadAnalytics();
    } catch (error) {
      setMessage(error.message);
    }
  }

  // Add a new child
  async function addStudent(event) {
    event.preventDefault();
    setMessage("");

    if (!newStudentName.trim() || !newStudentDivision) {
      setMessage("Please enter the child's name and select a division.");
      return;
    }

    try {
      await apiFetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newStudentName.trim(),
          division_id: Number(newStudentDivision),
        }),
      });

      setNewStudentName("");
      setNewStudentDivision("");

      setMessage("Child added successfully.");

      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  // Delete a child
  async function deleteStudent(id, name) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${name}? This will also delete the child's activities.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/api/students/${id}`, {
        method: "DELETE",
      });

      if (String(selectedStudent) === String(id)) {
        setSelectedStudent("");
      }

      if (String(searchStudent) === String(id)) {
        setSearchStudent("");
      }

      setMessage(`${name} was deleted successfully.`);

      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function clearFilters() {
    setSearchStudent("");
    setSearchDivision("");
    setSearchMonth("");
  }

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="logo">🌈</div>

          <h1>Little Stars</h1>
          <p className="subtitle">Play School Activity Portal</p>

          <form onSubmit={login}>
            <label>Email</label>

            <input
              type="email"
              placeholder="teacher@school.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label>Password</label>

            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <button className="primary-button" type="submit">
              Login
            </button>
          </form>

          {message && <div className="error-message">{message}</div>}

          <div className="demo-login">
            <strong>Demo accounts</strong>
            <p>Priya: priya@school.com / password</p>
            <p>Anita: anita@school.com / password</p>
            <p>Principal: principal@school.com / password</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>🌈 Little Stars</h1>
          <span>Play School Activity Portal</span>
        </div>

        <div className="user-area">
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="container">
        {message && <div className="success-message">{message}</div>}

        <section className="welcome-card">
          <div>
            <h2>Hello, {user.name.split(" ")[0]}! 👋</h2>

            <p>
              Capture the little moments that make every child's day special.
            </p>
          </div>

          <div className="role-badge">{user.role}</div>
        </section>

        <div className="dashboard-grid">
          <section className="card capture-card">
            <h2>💬 Capture a Moment</h2>

            <p className="card-description">
              Quickly record what a child did today.
            </p>

            <form onSubmit={addActivity}>
              <label>Child</label>

              <select
                value={selectedStudent}
                onChange={(event) =>
                  setSelectedStudent(event.target.value)
                }
                required
              >
                <option value="">Select a child</option>

                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} — {student.standard} {student.division}
                  </option>
                ))}
              </select>

              <label>What happened?</label>

              <textarea
                rows="4"
                placeholder='Example: "Harsh drew a dinosaur"'
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                required
              />

              <label>Photo</label>

              <input
                id="imageInput"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setImage(event.target.files[0] || null)
                }
              />

              <button className="primary-button" type="submit">
                Save Activity
              </button>
            </form>
          </section>

          <section className="card">
            <h2>🏫 My Divisions</h2>

            <p className="card-description">
              Divisions you are authorized to access.
            </p>

            <div className="division-list">
              {divisions.length === 0 ? (
                <div className="empty-state">
                  No divisions assigned.
                </div>
              ) : (
                divisions.map((division) => (
                  <div className="division-item" key={division.id}>
                    <strong>
                      {division.standard} - {division.division}
                    </strong>

                    <span>
                      {division.teacher_name || "Assigned teacher"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* MANAGE CHILDREN */}
        <section className="card manage-children-card">
          <div className="section-heading">
            <div>
              <h2>👧 Manage Children</h2>

              <p className="card-description">
                Add children to your authorized divisions or remove a child.
              </p>
            </div>

            <div className="child-count">
              {students.length} children
            </div>
          </div>

          <form className="add-child-form" onSubmit={addStudent}>
            <div>
              <label>Child Name</label>

              <input
                type="text"
                placeholder="Enter child's name"
                value={newStudentName}
                onChange={(event) =>
                  setNewStudentName(event.target.value)
                }
                required
              />
            </div>

            <div>
              <label>Division</label>

              <select
                value={newStudentDivision}
                onChange={(event) =>
                  setNewStudentDivision(event.target.value)
                }
                required
              >
                <option value="">Select division</option>

                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.standard} - {division.division}
                  </option>
                ))}
              </select>
            </div>

            <button className="primary-button" type="submit">
              + Add Child
            </button>
          </form>

          <div className="children-list">
            <h3>Children</h3>

            {students.length === 0 ? (
              <div className="empty-state">
                No children found.
              </div>
            ) : (
              students.map((student) => (
                <div className="child-row" key={student.id}>
                  <div className="child-info">
                    <strong>{student.name}</strong>

                    <span>
                      {student.standard} - {student.division}
                    </span>
                  </div>

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteStudent(student.id, student.name)
                    }
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="card history-card">
          <div className="section-heading">
            <div>
              <h2>🔎 Activity History</h2>

              <p className="card-description">
                Search and filter children's moments.
              </p>
            </div>
          </div>

          <div className="filters">
            <div>
              <label>Child</label>

              <select
                value={searchStudent}
                onChange={(event) =>
                  setSearchStudent(event.target.value)
                }
              >
                <option value="">All children</option>

                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Division</label>

              <select
                value={searchDivision}
                onChange={(event) =>
                  setSearchDivision(event.target.value)
                }
              >
                <option value="">All divisions</option>

                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.standard} - {division.division}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Month</label>

              <input
                type="month"
                value={searchMonth}
                onChange={(event) =>
                  setSearchMonth(event.target.value)
                }
              />
            </div>

            <button
              className="secondary-button"
              onClick={loadActivities}
            >
              Search
            </button>

            <button
              className="clear-button"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>

          <div className="activity-list">
            {activities.length === 0 ? (
              <div className="empty-state">
                No activities found.
              </div>
            ) : (
              activities.map((activity) => (
                <article
                  className="activity-item"
                  key={activity.id}
                >
                  <div className="activity-content">
                    <div className="activity-header">
                      <div>
                        <h3>{activity.student_name}</h3>

                        <span>
                          {activity.standard} - {activity.division}
                        </span>
                      </div>

                      <time>
                        {new Date(
                          activity.created_at
                        ).toLocaleString()}
                      </time>
                    </div>

                    <p>{activity.description}</p>

                    <small>
                      Recorded by {activity.teacher_name}
                    </small>
                  </div>

                  {activity.image_url && (
                    <img
                      className="activity-image"
                      src={`${API}${activity.image_url}`}
                      alt={activity.description}
                    />
                  )}

                  <button
                    className="delete-button"
                    onClick={() =>
                      deleteActivity(activity.id)
                    }
                  >
                    Delete
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        {user.role === "PRINCIPAL" && analytics && (
          <section className="card analytics-card">
            <h2>📊 Principal Analytics</h2>

            <div className="stat-card">
              <span>Total activities</span>
              <strong>{analytics.totalActivities}</strong>
            </div>

            <h3>Activities by Division</h3>

            <div className="analytics-list">
              {analytics.activityByDivision.map((item, index) => (
                <div className="analytics-row" key={index}>
                  <span>
                    {item.standard} - {item.division}
                  </span>

                  <strong>{item.activity_count}</strong>
                </div>
              ))}
            </div>

            <h3>Activities by Child</h3>

            <div className="analytics-list">
              {analytics.activityByStudent.map((item, index) => (
                <div className="analytics-row" key={index}>
                  <span>
                    {item.name} — {item.standard} {item.division}
                  </span>

                  <strong>{item.activity_count}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;