import { useEffect, useState } from "react"
import { API_BASE_URL } from "./api/client"

function App() {
  const [message, setMessage] = useState("Loading...");
  const [error, setError] = useState("");

  useEffect (() => {
    async function loadHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const data = await response.json();
        setMessage(`Frontend running. Backend status: ${data.status}`)
      } catch (err) {
        setError("Could not reach backend");
        console.error(err)
      }
    }

    loadHealth();
  }, []);

  return (
    <div>
      <h1>Frontend running</h1>
      <p>API base URL: {API_BASE_URL}</p>
      {error ? <p>{error}</p> : <p>{message}</p>}
    </div>
  )
}

export default App
