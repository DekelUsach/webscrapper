"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { downloadCSV } from "@/lib/utils";

export default function Home() {
  const [url, setUrl] = useState("");
  const [extractMode, setExtractMode] = useState<"current" | "all">("all");
  const [source, setSource] = useState<"messefrankfurt" | "fit">("messefrankfurt");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{title: string; text: string} | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [eventData, setEventData] = useState<{name: string; total: number} | null>(null);

  const handleExtract = async () => {
    // Basic validation
    if (source === "messefrankfurt") {
      if (!url.trim()) {
        setError({
          title: "URL requerida",
          text: "Por favor, ingresa el enlace de la página de expositores antes de continuar."
        });
        return;
      }

      if (!url.includes("messefrankfurt.com")) {
        setError({
          title: "Enlace no válido",
          text: "Asegúrate de que el enlace pertenece a una exposición de Messe Frankfurt (ej. hotelga.ar.messefrankfurt.com)."
        });
        return;
      }
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setEventData(null);

    try {
      const response = await fetch("/api/extractor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, extractMode, source })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Ocurrió un error inesperado al conectar con el servidor.");
      }

      setResults(data.data);
      setEventData({
        name: data.event,
        total: data.total
      });

      if (data.data.length === 0) {
        setError({
          title: "Sin resultados",
          text: "No encontramos expositores con correos en este enlace. Revisa que sea la pestaña correcta."
        });
      }
    } catch (err: any) {
      setError({
        title: "Ups, algo falló",
        text: err.message || "No pudimos extraer los datos. Intenta nuevamente."
      });
    } finally {
      setLoading(false);
    }
  };

  const clearInput = () => {
    setUrl("");
    setResults([]);
    setError(null);
    setEventData(null);
  };

  return (
    <main className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Scraper de Expositores</h1>
        <p className={styles.subtitle}>
          Extrae fácilmente la información de contacto y correos de Messe Frankfurt o FIT. Selecciona la fuente y nosotros hacemos el resto.
        </p>
      </div>

      <div className={styles.searchBox}>
        <div className={styles.inputGroup}>
          <label htmlFor="sourceSelect" className={styles.inputLabel}>
            Fuente de Datos
          </label>
          <select 
            id="sourceSelect"
            className={styles.selectField}
            value={source}
            onChange={(e) => setSource(e.target.value as "messefrankfurt" | "fit")}
            disabled={loading}
          >
            <option value="messefrankfurt">Messe Frankfurt (Intersec, Automechanika, etc.)</option>
            <option value="fit">FIT - Feria Internacional de Turismo</option>
          </select>
        </div>

        {source === "messefrankfurt" && (
          <>
            <div className={styles.inputGroup}>
              <label htmlFor="urlInput" className={styles.inputLabel}>
                Enlace de Messe Frankfurt
              </label>
              <input 
                id="urlInput"
                type="text" 
                className={styles.inputField}
                placeholder="Ej: https://hotelga.ar.messefrankfurt.com/buenos-aires/es/buscador-expositores.html"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="modeSelect" className={styles.inputLabel}>
                Modo de Extracción
              </label>
              <select 
                id="modeSelect"
                className={styles.selectField}
                value={extractMode}
                onChange={(e) => setExtractMode(e.target.value as "all" | "current")}
                disabled={loading}
              >
                <option value="all">Extraer TODOS los expositores del evento (Recomendado)</option>
                <option value="current">Extraer SÓLO de la página actual del enlace (Manual)</option>
              </select>
            </div>
          </>
        )}

        {error && (
          <div className={styles.errorBox}>
            <span className={styles.errorTitle}>{error.title}</span>
            <span className={styles.errorText}>{error.text}</span>
          </div>
        )}

        <div className={styles.buttonContainer}>
          <button 
            className={styles.primaryButton}
            onClick={handleExtract}
            disabled={loading || (source === "messefrankfurt" && !url)}
          >
            {loading ? "Extrayendo..." : "Extraer Correos"}
          </button>
        </div>
      </div>

      {loading && (
        <div className={styles.loaderContainer}>
          <div className={styles.spinner}></div>
          <span className={styles.loaderText}>Conectando con la base de datos de expositores...</span>
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className={styles.resultsSection}>
          <div className={styles.resultsHeader}>
            <div>
              <span className={styles.resultsTitle}>
                Resultados {eventData?.name ? `(${eventData.name})` : ''}
              </span>
              <span className={styles.resultsCount}>{eventData?.total} contactos</span>
            </div>
            
            <button 
              className={styles.secondaryButton}
              onClick={() => downloadCSV(results, `expositores_${eventData?.name || 'evento'}.csv`)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Descargar CSV
            </button>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Expositor</th>
                  <th>Email</th>
                  <th>Stand</th>
                  <th>Sitio Web</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.expositor}</td>
                    <td>
                      {item.email ? (
                        <a href={`mailto:${item.email}`}>{item.email}</a>
                      ) : (
                        <span className={styles.emptyCell}>Sin correo</span>
                      )}
                    </td>
                    <td>{item.stand || <span className={styles.emptyCell}>-</span>}</td>
                    <td>
                      {item.website ? (
                        <a href={item.website} target="_blank" rel="noopener noreferrer">
                          Ver sitio
                        </a>
                      ) : (
                        <span className={styles.emptyCell}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
