import React, { useCallback, useEffect, useState } from "react";
import "./App.css";
import logoLight from "./logo-light.png";
import logoDark from "./logo-dark.png";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
const TOKEN_KEY = "simplyjob_token";
const DARK_KEY = "simplyjob_dark_mode";
const PRIORITIES = ["Low", "Medium", "High"];
const MAX_NOTES_PREVIEW = 60;

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

const STATUSES = ["Applied", "Interview", "Offer", "Rejected"];

const MAX_TITLE_LENGTH = 60;
const MAX_COMPANY_LENGTH = 60;
const MAX_NOTES_LENGTH = 500;

function parseDateFlexible(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const str = String(value);

  // Try ISO-like formats first
  const iso = new Date(str);
  if (!Number.isNaN(iso.getTime())) {
    return iso;
  }

  // Try DD/MM/YYYY
  const ddmmyyyy = str.split("/");
  if (ddmmyyyy.length === 3) {
    const [dd, mm, yyyy] = ddmmyyyy.map((part) => parseInt(part, 10));
    if (!Number.isNaN(dd) && !Number.isNaN(mm) && !Number.isNaN(yyyy)) {
      const candidate = new Date(yyyy, mm - 1, dd);
      if (!Number.isNaN(candidate.getTime())) {
        return candidate;
      }
    }
  }

  return null;
}

function formatDateDDMMYYYY(value) {
  const date = parseDateFlexible(value);
  if (!date) return "—";

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  return `${dd}/${mm}/${yyyy}`;
}

function isNetworkError(err) {
  return err?.message === "Failed to fetch" || err?.name === "TypeError";
}

const CONNECTION_ERROR_MSG =
  "Connection failed. Please check your internet and try again.";

function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(DARK_KEY);
      if (stored === null) return true;
      return stored === "dark";
    } catch {
      return true;
    }
  });
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("applied_date");
  const [sortDirection, setSortDirection] = useState("asc");
  const [expandedNotes, setExpandedNotes] = useState({});
  const [editingJobId, setEditingJobId] = useState(null);
  const [editValues, setEditValues] = useState({
    title: "",
    company: "",
    notes: "",
    url: "",
    priority: "Medium",
  });

  const [formValues, setFormValues] = useState({
    title: "",
    company: "",
    status: "Applied",
    applied_date: "",
    notes: "",
    url: "",
    priority: "Medium",
  });
  const [urlError, setUrlError] = useState(null);
  const [appliedDateError, setAppliedDateError] = useState(null);
  const [cvModalOpen, setCvModalOpen] = useState(false);
  const [cvFileName, setCvFileName] = useState("");
  const [cvUploadSuccess, setCvUploadSuccess] = useState(false);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiJob, setAiJob] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiCallsRemaining, setAiCallsRemaining] = useState(null);
  const [aiCache, setAiCache] = useState(() => {
    try {
      const s = localStorage.getItem("simplyjob_ai_cache");
      if (!s) return {};
      return JSON.parse(s);
    } catch {
      return {};
    }
  });
  const [cvFeedbackModalOpen, setCvFeedbackModalOpen] = useState(false);
  const [cvFeedbackLoading, setCvFeedbackLoading] = useState(false);
  const [cvFeedbackError, setCvFeedbackError] = useState(null);
  const [cvFeedback, setCvFeedback] = useState(null);
  const [hasCvText, setHasCvText] = useState(false);
  const [aiUsage, setAiUsage] = useState({
    job_calls_remaining: null,
    cv_feedback_available: null,
    is_admin: false,
  });
  const [lastCvFeedbackDate, setLastCvFeedbackDate] = useState(null);

  const fetchJobs = useCallback(() => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setLoading(false);
      setJobs([]);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/jobs/`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error(
            "Failed to load jobs",
            res.status,
            res.statusText,
            data
          );
          throw new Error(data.error || "Failed to load jobs.");
        }
        return data;
      })
      .then((data) => {
        setJobs(data.jobs || []);
      })
      .catch((err) => {
        console.error("Error loading jobs", err);
        setError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Could not load jobs. Please try again."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      return;
    }

    fetch(`${API_BASE}/api/ai/usage`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load AI usage.");
        }
        setAiUsage({
          job_calls_remaining: data.job_calls_remaining,
          cv_feedback_available: data.cv_feedback_available,
          is_admin: !!data.is_admin,
        });
      })
      .catch(() => {
        // ignore usage load errors in UI
      });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
    try {
      localStorage.setItem(DARK_KEY, darkMode ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchJobs();
  }, [token, fetchJobs]);

  useEffect(() => {
    if (!authError) return;
    const t = setTimeout(() => setAuthError(null), 5000);
    return () => clearTimeout(t);
  }, [authError]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);
  useEffect(() => {
    if (!urlError) return;
    const t = setTimeout(() => setUrlError(null), 5000);
    return () => clearTimeout(t);
  }, [urlError]);
  useEffect(() => {
    if (!appliedDateError) return;
    const t = setTimeout(() => setAppliedDateError(null), 5000);
    return () => clearTimeout(t);
  }, [appliedDateError]);
  useEffect(() => {
    if (!cvError) return;
    const t = setTimeout(() => setCvError(null), 5000);
    return () => clearTimeout(t);
  }, [cvError]);
  useEffect(() => {
    if (!cvFeedbackError) return;
    const t = setTimeout(() => setCvFeedbackError(null), 5000);
    return () => clearTimeout(t);
  }, [cvFeedbackError]);
  useEffect(() => {
    if (!aiError) return;
    const t = setTimeout(() => setAiError(null), 5000);
    return () => clearTimeout(t);
  }, [aiError]);

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    setAuthError(null);

    const trimmedEmail = authEmail.trim();
    const password = authPassword;
    const confirmPassword = authConfirmPassword;

    if (!trimmedEmail || !password) {
      setAuthError("Please enter both email and password.");
      return;
    }

    const errors = [];

    if (authMode === "register") {
      if (password.length < 8) {
        errors.push("Password must be at least 8 characters.");
      }
      if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain an uppercase letter.");
      }
      if (!/\d/.test(password)) {
        errors.push("Password must contain a number.");
      }
      if (password !== confirmPassword) {
        errors.push("Passwords do not match.");
      }
    }

    if (errors.length > 0) {
      setAuthError(errors.join(" "));
      return;
    }

    const endpoint =
      authMode === "register"
        ? `${API_BASE}/api/auth/register`
        : `${API_BASE}/api/auth/login`;

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: trimmedEmail,
        password,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          let msg = data.error || "Authentication failed.";
          if (res.status === 401) msg = "Invalid email or password.";
          else if (/already registered|already exists/i.test(msg)) msg = "Email already registered.";
          else if (/password|8 characters|uppercase|number|match/i.test(msg)) msg = "Password does not meet requirements.";
          throw new Error(msg);
        }
        return data;
      })
      .then((data) => {
        if (!data.token) {
          throw new Error("No token returned from server.");
        }
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.removeItem("simplyjob_cv");
        localStorage.removeItem("simplyjob_cv_filename");
        localStorage.removeItem("simplyjob_ai_cache");
        setToken(data.token);
        setCvFileName("");
        setHasCvText(false);
        setAiCache({});
        // reset AI usage on new login
        setAiUsage({
          job_calls_remaining: null,
          cv_feedback_available: null,
          is_admin: false,
        });
        setAuthPassword("");
        setAuthConfirmPassword("");
      })
      .catch((err) => {
        setAuthError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Authentication failed."));
      });
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("simplyjob_cv");
      localStorage.removeItem("simplyjob_cv_filename");
      localStorage.removeItem("simplyjob_ai_cache");
    } catch {
      // ignore
    }
    setToken(null);
    setJobs([]);
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setError(null);
    setAuthError(null);
    setCvModalOpen(false);
    setAiModalOpen(false);
    setCvFeedbackModalOpen(false);
    setCvFeedback(null);
    setLastCvFeedbackDate(null);
    setAiCache({});
    setCvFileName("");
    setHasCvText(false);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;

    setFormValues((prev) => {
      let nextValue = value;

      if (name === "title") {
        nextValue = value.slice(0, MAX_TITLE_LENGTH);
      } else if (name === "company") {
        nextValue = value.slice(0, MAX_COMPANY_LENGTH);
      } else if (name === "notes") {
        nextValue = value.slice(0, MAX_NOTES_LENGTH);
      }

      return {
        ...prev,
        [name]: nextValue,
      };
    });

    if (name === "url") {
      setUrlError(null);
    }
    if (name === "applied_date") {
      setAppliedDateError(null);
    }
  };

  const resetForm = () => {
    setFormValues({
      title: "",
      company: "",
      status: "Applied",
      applied_date: "",
      notes: "",
      url: "",
    });
  };

  const handleCreateJob = (event) => {
    event.preventDefault();
    setError(null);

    if (!formValues.title.trim() || !formValues.company.trim()) {
      setError("Please provide both a title and company.");
      return;
    }

    const trimmedUrl = formValues.url.trim();
    if (trimmedUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(trimmedUrl);
      } catch {
        setUrlError(
          "Please enter a valid URL (e.g. https://careers.example.com)"
        );
        return;
      }
    }

    const appliedDateVal = formValues.applied_date?.trim();
    if (appliedDateVal) {
      const y = parseInt(appliedDateVal.slice(0, 4), 10);
      if (Number.isNaN(y) || y < 2000 || y > 2030) {
        setAppliedDateError("Please enter a valid date");
        return;
      }
    }
    setAppliedDateError(null);

    const payload = {
      title: formValues.title.trim(),
      company: formValues.company.trim(),
      status: formValues.status,
      applied_date: appliedDateVal || undefined,
      notes: formValues.notes.trim() || undefined,
      url: trimmedUrl || undefined,
      priority: formValues.priority,
    };

    setSubmitting(true);

    const currentToken = getStoredToken();
    if (!currentToken) {
      setError("Not authenticated.");
      return;
    }

    fetch(`${API_BASE}/api/jobs/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to save job. Please try again.");
        }
        return data;
      })
      .then((data) => {
        setJobs((prev) => [data.job, ...prev]);
        resetForm();
        setSubmitting(false);
        fetchJobs();
      })
      .catch((err) => {
        setError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to save job. Please try again."));
        setSubmitting(false);
      });
  };

  const handleDeleteJob = (jobId) => {
    if (!window.confirm("Are you sure you want to delete this job?")) {
      return;
    }

    setError(null);
    setDeletingId(jobId);

    const currentToken = getStoredToken();
    if (!currentToken) {
      setError("Not authenticated.");
      return;
    }

    fetch(`${API_BASE}/api/jobs/${jobId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })
      .then(async (res) => {
        if (!res.ok && res.status !== 204) {
          const text = await res.text();
          throw new Error(text || "Failed to delete job. Please try again.");
        }
      })
      .then(() => {
        setJobs((prev) => prev.filter((job) => job.id !== jobId));
        setDeletingId(null);
      })
      .catch((err) => {
        setError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to delete job. Please try again."));
        setDeletingId(null);
      });
  };

  const handleStatusChange = (jobId, newStatus) => {
    if (!newStatus || newStatus === "") return;

    setError(null);
    setUpdatingId(jobId);

    const currentToken = getStoredToken();
    if (!currentToken) {
      setError("Not authenticated.");
      return;
    }

    fetch(`${API_BASE}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to update job. Please try again.");
        }
        return data;
      })
      .then((data) => {
        setJobs((prev) =>
          prev.map((job) => (job.id === jobId ? data.job : job))
        );
        setUpdatingId(null);
      })
      .catch((err) => {
        setError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to update job. Please try again."));
        setUpdatingId(null);
      });
  };

  const handleToggleNotes = (jobId) => {
    setExpandedNotes((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  const handleStartEdit = (job) => {
    setEditingJobId(job.id);
    setEditValues({
      title: job.title || "",
      company: job.company || "",
      notes: job.notes || "",
      url: job.url || "",
      priority: job.priority || "Medium",
    });
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingJobId(null);
    setEditValues({
      title: "",
      company: "",
      notes: "",
      url: "",
    });
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditValues((prev) => {
      let nextValue = value;
      if (name === "title") {
        nextValue = value.slice(0, MAX_TITLE_LENGTH);
      } else if (name === "company") {
        nextValue = value.slice(0, MAX_COMPANY_LENGTH);
      } else if (name === "notes") {
        nextValue = value.slice(0, MAX_NOTES_LENGTH);
      }
      return {
        ...prev,
        [name]: nextValue,
      };
    });
  };

  const handleSaveEdit = (jobId) => {
    if (!editValues.title.trim() || !editValues.company.trim()) {
      setError("Please provide both a title and company.");
      return;
    }

    setError(null);
    setUpdatingId(jobId);

    const payload = {
      title: editValues.title.trim(),
      company: editValues.company.trim(),
      notes: editValues.notes.trim(),
      url: editValues.url.trim() || null,
      priority: editValues.priority,
    };

    const currentToken = getStoredToken();
    if (!currentToken) {
      setError("Not authenticated.");
      return;
    }

    fetch(`${API_BASE}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to update job. Please try again.");
        }
        return data;
      })
      .then((data) => {
        setJobs((prev) =>
          prev.map((job) => (job.id === jobId ? data.job : job))
        );
        setUpdatingId(null);
        setEditingJobId(null);
      })
      .catch((err) => {
        setError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to update job. Please try again."));
        setUpdatingId(null);
      });
  };

  const openCvModal = () => {
    try {
      const storedFileName = localStorage.getItem("simplyjob_cv_filename") || "";
      setCvFileName(storedFileName);
      const storedCv = localStorage.getItem("simplyjob_cv") || "";
      setHasCvText(storedCv.trim().length > 0);
    } catch {
      setCvFileName("");
      setHasCvText(false);
    }
    setCvUploadSuccess(false);
    setCvError(null);
    setCvModalOpen(true);

    // Load last saved CV feedback metadata
    const currentToken = getStoredToken();
    if (!currentToken) {
      return;
    }

    fetch(`${API_BASE}/api/ai/cv-feedback`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        console.log("[CV feedback GET /api/ai/cv-feedback] response:", data);
        if (!res.ok) {
          throw new Error(data.error || "Failed to load CV feedback.");
        }
        const feedbackText = data.feedback ?? data.cv_feedback ?? null;
        const dateStr = data.cv_feedback_date ?? null;
        if (feedbackText) {
          setCvFeedback(feedbackText);
          setLastCvFeedbackDate(dateStr ? new Date(dateStr) : null);
        } else {
          setCvFeedback(null);
          setLastCvFeedbackDate(null);
        }
      })
      .catch(() => {
        // ignore load errors here; user can still request new feedback
      });
  };

  const closeCvModal = () => {
    setCvModalOpen(false);
  };

  const openCvReviewModal = () => {
    const currentToken = getStoredToken();
    if (!currentToken) return;
    setCvFeedbackModalOpen(true);
    fetch(`${API_BASE}/api/ai/cv-feedback`, {
      method: "GET",
      headers: { Authorization: `Bearer ${currentToken}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const feedbackText = data.feedback ?? data.cv_feedback ?? null;
        const dateStr = data.cv_feedback_date ?? null;
        if (feedbackText) {
          setCvFeedback(feedbackText);
          setLastCvFeedbackDate(dateStr ? new Date(dateStr) : null);
        } else {
          setCvFeedback(null);
          setLastCvFeedbackDate(null);
        }
      })
      .catch(() => {});
  };

  const handleCvClear = () => {
    try {
      localStorage.removeItem("simplyjob_cv");
      localStorage.removeItem("simplyjob_cv_filename");
    } catch {
      // ignore
    }
    setCvFileName("");
    setHasCvText(false);
    setCvUploadSuccess(false);
    setCvError(null);
  };

  const handleCvUpload = async (event, onSuccess) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setCvError(null);
    setCvUploadSuccess(false);
    setCvUploading(true);

    const currentToken = getStoredToken();
    if (!currentToken) {
      setCvError("Not authenticated.");
      setCvUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/ai/extract-cv`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload CV. Please try again.");
      }

      const text = data.cv_text || "";
      try {
        localStorage.setItem("simplyjob_cv", text);
        localStorage.setItem("simplyjob_cv_filename", file.name);
      } catch {
        // ignore storage errors
      }

      setCvFileName(file.name);
      setCvUploadSuccess(true);
      setHasCvText(text.trim().length > 0);
      if (typeof onSuccess === "function") onSuccess();
    } catch (err) {
      setCvError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to upload CV. Please try again."));
    } finally {
      setCvUploading(false);
    }
  };

  const formatInline = (text) => {
    if (!text) return null;

    const parts = text.split("**");
    if (parts.length === 1) {
      return text;
    }

    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={`strong-${index}`}>{part}</strong>;
      }
      return part;
    });
  };

  const renderFeedback = (text) => {
    if (!text) return null;

    const lines = text.split(/\r?\n/);

    return lines.map((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return <br key={`br-${index}`} />;
      }

      if (trimmed.startsWith("## ")) {
        return (
          <h3 className="ai-feedback-heading" key={`h3-${index}`}>
            {formatInline(trimmed.slice(3))}
          </h3>
        );
      }

      if (trimmed.startsWith("# ")) {
        return (
          <h2 className="ai-feedback-heading" key={`h2-${index}`}>
            {formatInline(trimmed.slice(2))}
          </h2>
        );
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const content = trimmed.replace(/^[-*]\s+/, "");
        return (
          <div className="ai-feedback-list-item" key={`bullet-${index}`}>
            • {formatInline(content)}
          </div>
        );
      }

      if (/^\d+[\.\)]\s+/.test(trimmed)) {
        const content = trimmed.replace(/^\d+[\.\)]\s+/, "");
        return (
          <div className="ai-feedback-list-item" key={`num-${index}`}>
            • {formatInline(content)}
          </div>
        );
      }

      return (
        <p className="ai-feedback-paragraph" key={`p-${index}`}>
          {formatInline(trimmed)}
        </p>
      );
    });
  };

  const openAiModalForJob = (job, forceRefresh = false) => {
    setAiJob(job);
    setAiError(null);
    setAiModalOpen(true);

    const cached = aiCache[job.id];
    if (cached && cached.feedback && !forceRefresh) {
      // Show cached response immediately without making a new API call
      setAiFeedback(cached.feedback);
      setAiCallsRemaining(
        typeof cached.callsRemaining === "number"
          ? cached.callsRemaining
          : null
      );
      setAiLoading(false);
      return;
    }

    // No cache (or forced refresh) — clear previous response and fetch fresh
    setAiFeedback(null);
    setAiCallsRemaining(null);

    let storedCv = "";
    try {
      storedCv = localStorage.getItem("simplyjob_cv") || "";
    } catch {
      storedCv = "";
    }

    if (!storedCv.trim()) {
      setAiError("Please upload your CV first");
      setAiLoading(false);
      return;
    }

    const currentToken = getStoredToken();
    if (!currentToken) {
      setAiError("Not authenticated.");
      setAiLoading(false);
      return;
    }

    setAiLoading(true);

    fetch(`${API_BASE}/api/ai/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({
        job_title: job.title,
        company: job.company,
        notes: job.notes || "",
        url: job.url || "",
        priority: job.priority || "Medium",
        cv_text: storedCv,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 429) {
            throw new Error("Daily limit reached (3/3). Resets tomorrow.");
          }
          throw new Error(data.error || "Failed to generate feedback. Please try again.");
        }
        return data;
      })
      .then((data) => {
        const feedbackText = data.feedback || "";
        const callsRemainingValue =
          typeof data.calls_remaining === "number"
            ? data.calls_remaining
            : null;

        setAiFeedback(feedbackText);
        if (callsRemainingValue != null) {
          setAiCallsRemaining(callsRemainingValue);
        }

        setAiCache((prev) => {
          const next = {
            ...prev,
            [job.id]: {
              feedback: feedbackText,
              callsRemaining: callsRemainingValue,
              lastUpdated: new Date(),
            },
          };
          try {
            localStorage.setItem("simplyjob_ai_cache", JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });

        setAiUsage((prev) => ({
          ...prev,
          job_calls_remaining: callsRemainingValue,
        }));

        setAiLoading(false);
      })
      .catch((err) => {
        setAiError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to generate feedback. Please try again."));
        setAiLoading(false);
      });
  };

  const closeAiModal = () => {
    setAiModalOpen(false);
    setAiJob(null);
    setAiError(null);
    setAiFeedback(null);
  };

  const handleCvFeedback = async () => {
    setCvFeedbackError(null);

    let storedCv = "";
    try {
      storedCv = localStorage.getItem("simplyjob_cv") || "";
    } catch {
      storedCv = "";
    }

    if (!storedCv.trim()) {
      setCvFeedbackError("Please upload your CV first");
      return;
    }

    const currentToken = getStoredToken();
    if (!currentToken) {
      setCvFeedbackError("Not authenticated.");
      return;
    }

    setCvFeedbackLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/ai/cv-feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ cv_text: storedCv }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Daily CV review limit reached (1/1). Resets tomorrow.");
        }
        throw new Error(data.error || "Failed to generate feedback. Please try again.");
      }

      setCvFeedback(data.feedback || "");
      setAiUsage((prev) => ({ ...prev, cv_feedback_available: false }));
      if (data.cv_feedback_date) {
        setLastCvFeedbackDate(new Date(data.cv_feedback_date));
      }
      setCvFeedbackModalOpen(true);
      setAiUsage((prev) => ({
        ...prev,
        cv_feedback_available: prev.is_admin ? true : false,
      }));
    } catch (err) {
      setCvFeedbackError(isNetworkError(err) ? CONNECTION_ERROR_MSG : (err.message || "Failed to generate feedback. Please try again."));
    } finally {
      setCvFeedbackLoading(false);
    }
  };

  const formatRelativeTime = (dateValue) => {
    if (!dateValue) return null;
    const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;

    const diffMs = Date.now() - d.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) {
      return `Generated ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    }
    if (diffDays < 2) {
      const hours = Math.floor(diffMinutes / 60);
      return `Generated ${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `Generated on ${dd}/${mm}/${yyyy}`;
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      searchQuery.trim().length === 0 ||
      `${job.title || ""} ${job.company || ""}`
        .toLowerCase()
        .includes(searchQuery.trim().toLowerCase());

    const matchesStatus =
      statusFilter === "All" || job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const PRIORITY_ORDER = { Low: 1, Medium: 2, High: 3 };
  const STATUS_ORDER = { Applied: 1, Interview: 2, Offer: 3, Rejected: 4 };

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'priority') {
      comparison =
        (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0);
    } else if (sortBy === 'status') {
      comparison =
        (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
    } else if (sortBy === 'title') {
      comparison = (a.title || '').localeCompare(b.title || '');
    } else if (sortBy === 'applied_date') {
      comparison =
        new Date(a.applied_date || 0) - new Date(b.applied_date || 0);
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const totalJobs = jobs.length;
  const visibleJobs = sortedJobs.length;
  const hasActiveFilters =
    searchQuery.trim().length > 0 || statusFilter !== "All";

  const themeIcon = darkMode ? "☀️" : "🌙";
  const themeLabel = darkMode ? "Light" : "Dark";

  if (!token) {
    const isLogin = authMode === "login";

    return (
      <div className="app-root">
        <div className="app-container auth-container" style={{ maxWidth: 420 }}>
        <header className="app-header">
          <div className="app-header-left">
            <img
              src={darkMode ? logoDark : logoLight}
              alt="SimplyJob"
              className="header-logo"
            />
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setDarkMode((prev) => !prev)}
          >
            <span className="theme-toggle-icon">{themeIcon}</span>
            <span>{themeLabel} mode</span>
          </button>
        </header>

          <main className="auth-main">
            <section className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  {isLogin ? "Login" : "Create an account"}
                </h2>
              </div>
              <form className="form" onSubmit={handleAuthSubmit}>
                <div className="field">
                  <label className="field-label" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    name="auth-email"
                    type="email"
                    className="field-input"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    name="auth-password"
                    type="password"
                    className="field-input"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {authMode === "register" && (
                  <>
                    <div className="field">
                      <label className="field-label" htmlFor="auth-confirm">
                        Confirm password
                      </label>
                      <input
                        id="auth-confirm"
                        name="auth-confirm"
                        type="password"
                        className="field-input"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                        placeholder="Repeat your password"
                      />
                    </div>
                    <div className="password-checklist">
                      <div
                        className={
                          authPassword.length >= 8
                            ? "password-check-item ok"
                            : "password-check-item"
                        }
                      >
                        At least 8 characters
                      </div>
                      <div
                        className={
                          /[A-Z]/.test(authPassword)
                            ? "password-check-item ok"
                            : "password-check-item"
                        }
                      >
                        At least one uppercase letter
                      </div>
                      <div
                        className={
                          /\d/.test(authPassword)
                            ? "password-check-item ok"
                            : "password-check-item"
                        }
                      >
                        At least one number
                      </div>
                    </div>
                  </>
                )}
                <div className="form-footer">
                  <button type="submit" className="btn">
                    {isLogin ? "Login" : "Register"}
                  </button>
                </div>
                {authError && (
                  <div className="error-text error-text-dismiss">
                    {authError}
                    <button type="button" className="error-dismiss" onClick={() => setAuthError(null)} aria-label="Close">✕</button>
                  </div>
                )}
              </form>
              <div className="helper-text" style={{ marginTop: 10 }}>
                {isLogin ? (
                  <>
                    Need an account?{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setAuthMode("register");
                        setAuthError(null);
                      }}
                    >
                      Register
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setAuthMode("login");
                        setAuthError(null);
                      }}
                    >
                      Login
                    </button>
                  </>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-root">
        <div className="app-container app-shell">
        <header className="app-header">
          <div className="app-header-left">
            <img
              src={darkMode ? logoDark : logoLight}
              alt="SimplyJob"
              className="header-logo"
            />
            {aiUsage.is_admin && (
              <span className="admin-badge">Admin</span>
            )}
          </div>
          <div className="app-header-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setDarkMode((prev) => !prev)}
            >
              <span className="theme-toggle-icon">{themeIcon}</span>
              <span>{themeLabel}</span>
            </button>
            <button
              type="button"
              className="btn btn-cv-prominent"
              onClick={openCvModal}
            >
              My CV
            </button>
            <button
              type="button"
              className="btn-secondary btn"
              onClick={openCvReviewModal}
            >
              CV Review
            </button>
            <button
              type="button"
              className="btn-secondary btn"
              onClick={handleLogout}
            >
              Logout
            </button>
            <div className="status-pill-row">
              {STATUSES.map((status) => (
                <span
                  key={status}
                  className={`status-pill status-pill-${status}`}
                >
                  {status}
                </span>
              ))}
            </div>
          </div>
        </header>

        <main className="app-main">
          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Job applications</h2>
              <span className="badge-count">
                {hasActiveFilters
                  ? `${visibleJobs} of ${totalJobs} jobs`
                  : `${totalJobs} jobs`}
              </span>
            </div>

            <div className="toolbar">
              <div className="toolbar-left">
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by title or company…"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={handleStatusFilterChange}
                >
                  <option value="All">All statuses</option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="toolbar-right">
                {hasActiveFilters
                  ? `${visibleJobs} of ${totalJobs} jobs shown`
                  : `${totalJobs} jobs`}
              </div>
            </div>

            {loading ? (
              <div className="loading">Loading jobs…</div>
            ) : visibleJobs === 0 ? (
              <div className="empty-state">
                No jobs yet. Use the form on the right to add your first
                application.
              </div>
            ) : (
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th
                      className={`sortable-header${
                        sortBy === "title" ? " sortable-header-active" : ""
                      }`}
                      onClick={() => handleSort("title")}
                    >
                      <span>
                        Job
                        {sortBy === "title" &&
                          (sortDirection === "asc" ? " ↑" : " ↓")}
                      </span>
                    </th>
                    <th
                      className={`sortable-header${
                        sortBy === "priority" ? " sortable-header-active" : ""
                      }`}
                      onClick={() => handleSort("priority")}
                    >
                      <span>
                        Priority
                        {sortBy === "priority" &&
                          (sortDirection === "asc" ? " ↑" : " ↓")}
                      </span>
                    </th>
                    <th
                      className={`sortable-header${
                        sortBy === "status" ? " sortable-header-active" : ""
                      }`}
                      onClick={() => handleSort("status")}
                    >
                      <span>
                        Status
                        {sortBy === "status" &&
                          (sortDirection === "asc" ? " ↑" : " ↓")}
                      </span>
                    </th>
                    <th
                      className={`sortable-header${
                        sortBy === "applied_date"
                          ? " sortable-header-active"
                          : ""
                      }`}
                      onClick={() => handleSort("applied_date")}
                    >
                      <span>
                        Applied
                        {sortBy === "applied_date" &&
                          (sortDirection === "asc" ? " ↑" : " ↓")}
                      </span>
                    </th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedJobs.map((job) => {
                    const notesText = (job.notes || "").trim();
                    const isExpanded = !!expandedNotes[job.id];
                    const shouldTruncate = notesText.length > 100;
                    const displayNotes =
                      !notesText || !shouldTruncate || isExpanded
                        ? notesText || "—"
                        : `${notesText.slice(0, 100)}…`;

                    const isOverdue = (() => {
                      if (job.status !== "Applied") return false;
                      const applied = parseDateFlexible(job.applied_date);
                      if (!applied) return false;
                      const now = new Date();
                      const diffMs = now.getTime() - applied.getTime();
                      const diffDays = diffMs / (1000 * 60 * 60 * 24);
                      return diffDays >= 21;
                    })();

                    const isEditing = editingJobId === job.id;

                    return (
                    <tr
                      key={job.id}
                      className={`job-row${isOverdue ? " overdue-row" : ""}`}
                      title={
                        isOverdue ? "No update in 21+ days" : undefined
                      }
                    >
                      <td>
                        {isEditing ? (
                          <>
                            <input
                              className="inline-input"
                              name="title"
                              value={editValues.title}
                              onChange={handleEditChange}
                            />
                            <input
                              className="inline-input"
                              name="company"
                              value={editValues.company}
                              onChange={handleEditChange}
                              style={{ marginTop: 6 }}
                            />
                          </>
                        ) : (
                          <>
                            <div className="job-title">{job.title}</div>
                            <div className="job-company">{job.company}</div>
                          </>
                        )}
                        {(job.url || (isEditing && editValues.url)) && (
                          <div>
                            {isEditing ? (
                              <input
                                className="inline-input"
                                name="url"
                                placeholder="Application URL"
                                value={editValues.url}
                                onChange={handleEditChange}
                                style={{ marginTop: 6 }}
                              />
                            ) : (
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noreferrer"
                                className="job-url-link"
                              >
                                View application
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                                            <td>
                        <span
                          className={`priority-tag priority-${
                            job.priority || "Medium"
                          }`}
                        >
                          {job.priority || "Medium"}
                        </span>
                        {isEditing && (
                          <div style={{ marginTop: 6 }}>
                            <select
                              className="status-select"
                              name="priority"
                              value={editValues.priority}
                              onChange={handleEditChange}
                            >
                              {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                      <td>
                        <div
                          className={`status-badge status-${job.status || "Applied"}`}
                        >
                          {job.status || "Applied"}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <select
                            className="status-select"
                            value={job.status || "Applied"}
                            onChange={(event) =>
                              handleStatusChange(job.id, event.target.value)
                            }
                            disabled={updatingId === job.id}
                          >
                            {STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        {formatDateDDMMYYYY(job.applied_date)}
                      </td>
                      <td className="job-notes">
                        {isEditing ? (
                          <textarea
                            className="inline-textarea"
                            name="notes"
                            value={editValues.notes}
                            onChange={handleEditChange}
                          />
                        ) : (
                          <>
                            <div
                              className={
                                isExpanded
                                  ? "job-notes-full"
                                  : "job-notes-clamped"
                              }
                            >
                              {displayNotes}
                            </div>
                            {notesText && notesText.length > 100 && (
                              <div
                                className="notes-toggle"
                                onClick={() => handleToggleNotes(job.id)}
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="actions-cell">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn"
                              onClick={() => handleSaveEdit(job.id)}
                              disabled={updatingId === job.id}
                            >
                              {updatingId === job.id ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn"
                              onClick={handleCancelEdit}
                              disabled={updatingId === job.id}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn-secondary btn"
                              onClick={() => handleStartEdit(job)}
                              disabled={updatingId === job.id}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ai"
                              onClick={() => openAiModalForJob(job)}
                              disabled={updatingId === job.id}
                            >
                              AI
                            </button>
                            {aiUsage.job_calls_remaining != null && (
                              <span className="ai-usage-inline">
                                {aiUsage.is_admin
                                  ? "∞"
                                  : `${aiUsage.job_calls_remaining} left`}
                              </span>
                            )}
                            <button
                              type="button"
                              className="btn btn-delete"
                              onClick={() => handleDeleteJob(job.id)}
                              disabled={deletingId === job.id}
                            >
                              {deletingId === job.id ? "Deleting…" : "Delete"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Add a job</h2>
            </div>
            <form className="form" onSubmit={handleCreateJob}>
              <div className="field">
                <label className="field-label" htmlFor="title">
                  Job title <span>*</span>
                </label>
                <input
                  id="title"
                  name="title"
                  className="field-input"
                  placeholder="Product Designer"
                  value={formValues.title}
                  onChange={handleFormChange}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="company">
                  Company <span>*</span>
                </label>
                <input
                  id="company"
                  name="company"
                  className="field-input"
                  placeholder="Acme Inc."
                  value={formValues.company}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-row">
                <div className="field">
                  <label className="field-label" htmlFor="status">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    className="field-select"
                    value={formValues.status}
                    onChange={handleFormChange}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="applied_date">
                    Applied date
                  </label>
                  <input
                    id="applied_date"
                    name="applied_date"
                    type="date"
                    className="field-input"
                    min="2000-01-01"
                    max="2030-12-31"
                    value={formValues.applied_date}
                    onChange={handleFormChange}
                  />
                  {appliedDateError && (
                    <div className="error-text error-text-dismiss">
                      {appliedDateError}
                      <button
                        type="button"
                        className="error-dismiss"
                        onClick={() => setAppliedDateError(null)}
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="priority">
                  Priority
                </label>
                <select
                  id="priority"
                  name="priority"
                  className="field-select"
                  value={formValues.priority}
                  onChange={handleFormChange}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="url">
                  Application URL
                </label>
                <input
                  id="url"
                  name="url"
                  className="field-input"
                  placeholder="https://careers.example.com/apply"
                  value={formValues.url}
                  onChange={handleFormChange}
                />
                {urlError && (
                  <div className="error-text error-text-dismiss">
                    {urlError}
                    <button type="button" className="error-dismiss" onClick={() => setUrlError(null)} aria-label="Close">✕</button>
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  className="field-textarea"
                  placeholder="Interviewers, salary range, links, next steps…"
                  value={formValues.notes}
                  onChange={handleFormChange}
                />
                <div className="char-counter">
                  {formValues.notes.length} / {MAX_NOTES_LENGTH}
                </div>
                <p className="helper-text">
                  Only title and company are required. Status defaults to
                  &nbsp;“Applied” and the applied date defaults to today if left
                  blank.
                </p>
              </div>

              <div className="form-footer">
                <button
                  type="submit"
                  className="btn"
                  disabled={submitting}
                >
                  {submitting ? "Adding…" : "Add job"}
                </button>
              </div>

              {error && (
                <div className="error-text error-text-dismiss">
                  {error}
                  <button type="button" className="error-dismiss" onClick={() => setError(null)} aria-label="Close">✕</button>
                </div>
              )}
            </form>
          </section>
        </main>

        {cvModalOpen && (
          <div className="modal-overlay" onClick={closeCvModal}>
            <div
              className="modal"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="modal-header">
                <h2 className="modal-title">My CV</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeCvModal}
                >
                  ✕
                </button>
              </div>
              <p className="modal-subtitle">
                Upload your CV as a PDF. This is used for AI job feedback.
              </p>
              <input
                type="file"
                accept=".pdf"
                onChange={handleCvUpload}
              />
              {cvUploading && (
                <div className="spinner-container">
                  <div className="spinner" />
                  <span>Uploading CV…</span>
                </div>
              )}
              {cvFileName && (
                <p className="helper-text">File: {cvFileName}</p>
              )}
              {cvUploadSuccess && (
                <div className="cv-saved">CV uploaded successfully</div>
              )}
              {cvError && (
                <div className="error-text error-text-dismiss">
                  {cvError}
                  <button type="button" className="error-dismiss" onClick={() => setCvError(null)} aria-label="Close">✕</button>
                </div>
              )}
              <div className="form-footer" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary btn"
                  onClick={handleCvClear}
                  disabled={cvUploading}
                >
                  Remove CV
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleCvFeedback}
                  disabled={!hasCvText || cvFeedbackLoading || (!aiUsage.is_admin && aiUsage.cv_feedback_available === false)}
                >
                  {cvFeedbackLoading ? "Analysing your CV..." : "Get CV Feedback"}
                </button>
              </div>
              {cvFeedbackError && (
                <div className="error-text error-text-dismiss">
                  {cvFeedbackError}
                  <button type="button" className="error-dismiss" onClick={() => setCvFeedbackError(null)} aria-label="Close">✕</button>
                </div>
              )}
              <div className="cv-last-review-row" style={{ marginTop: 16 }}>
                {lastCvFeedbackDate ? (
                  <button
                    type="button"
                    className="btn-secondary btn btn-view-last-cv-review"
                    onClick={() => setCvFeedbackModalOpen(true)}
                  >
                    View Last CV Review ({formatDateDDMMYYYY(lastCvFeedbackDate)})
                  </button>
                ) : (
                  <span className="cv-no-review-yet">No CV review yet</span>
                )}
              </div>
            </div>
          </div>
        )}

        {aiModalOpen && (
          <div
            className="modal-overlay"
            onClick={() => {
              closeAiModal();
            }}
          >
            <div
              className="modal"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="modal-header">
                <h2 className="modal-title">
                  {aiJob
                    ? `AI Feedback — ${aiJob.title} at ${aiJob.company}`
                    : "AI Feedback"}
                </h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeAiModal}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {!aiJob && (
                  <p className="modal-subtitle">
                    Select a job to get AI feedback.
                  </p>
                )}
                {aiJob && (() => {
                  let storedCv = "";
                  try {
                    storedCv = localStorage.getItem("simplyjob_cv") || "";
                  } catch {
                    storedCv = "";
                  }
                  if (!storedCv.trim()) {
                    return (
                      <>
                        <p className="modal-subtitle">No CV saved yet.</p>
                        <div className="field" style={{ marginTop: 8 }}>
                          <label className="field-label">Upload CV</label>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              handleCvUpload(e, () => {
                                if (aiJob) openAiModalForJob(aiJob);
                              });
                            }}
                            disabled={cvUploading}
                          />
                          {cvUploading && (
                            <div className="spinner-container" style={{ marginTop: 6 }}>
                              <div className="spinner" />
                              <span>Uploading…</span>
                            </div>
                          )}
                        </div>
                        <p className="helper-text" style={{ marginTop: 8 }}>
                          or{" "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              closeAiModal();
                              openCvModal();
                            }}
                          >
                            manage your CV in My CV
                          </button>
                        </p>
                      </>
                    );
                  }
                  return (
                    <>
                      {aiLoading && (
                        <div className="spinner-container">
                          <div className="spinner" />
                          <span>
                            Analysing your CV against this role...
                          </span>
                        </div>
                      )}
                      {aiError && (
                        <div className="error-text error-text-dismiss">
                          {aiError}
                          <button type="button" className="error-dismiss" onClick={() => setAiError(null)} aria-label="Close">✕</button>
                        </div>
                      )}
                      {!aiLoading && aiFeedback && (
                        <>
                          {aiCache[aiJob.id] && (
                            <div className="ai-feedback-cache-meta">
                              <span className="ai-remaining">
                                Cached response
                              </span>
                              {aiCache[aiJob.id].lastUpdated && (
                                <span className="ai-remaining">
                                  {formatRelativeTime(
                                    aiCache[aiJob.id].lastUpdated
                                  )}
                                </span>
                              )}
                              <button
                                type="button"
                                className="btn-secondary btn"
                                onClick={() => openAiModalForJob(aiJob, true)}
                              >
                                Refresh
                              </button>
                            </div>
                          )}
                          <div className="ai-response-box">
                            {renderFeedback(aiFeedback)}
                          </div>
                          {aiCallsRemaining != null && (
                            <div className="ai-remaining ai-remaining-bottom">
                              {aiCallsRemaining} of 3 daily requests remaining
                            </div>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        </div>

        {cvFeedbackModalOpen && (
          <div
            className="modal-overlay"
            onClick={() => {
              setCvFeedbackModalOpen(false);
            }}
          >
            <div
              className="modal"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <div className="modal-header">
                <h2 className="modal-title">CV Review</h2>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setCvFeedbackModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                {!hasCvText ? (
                  <>
                    <p className="modal-subtitle">Upload your CV first using My CV.</p>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setCvFeedbackModalOpen(false);
                        openCvModal();
                      }}
                    >
                      My CV
                    </button>
                  </>
                ) : (
                  <>
                    {lastCvFeedbackDate && (
                      <p className="cv-review-generated-date">
                        Generated on {formatDateDDMMYYYY(lastCvFeedbackDate)}
                      </p>
                    )}
                    {cvFeedback ? (
                      <div className="ai-response-box">
                        {renderFeedback(cvFeedback)}
                      </div>
                    ) : (
                      <p className="cv-no-review-yet">No review content to display.</p>
                    )}
                    <div className="form-footer" style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setCvFeedbackModalOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
