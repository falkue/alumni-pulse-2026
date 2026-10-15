/**
 * Unterseite eines Bereichs (/school/:sectionId). Zeigt Platzhalter-Karten
 * im Skeleton-Look; die echten Auswertungen kommen später aus aggregates/{schoolId}.
 */
import { Navigate, useParams } from 'react-router-dom';
import { CareerPage } from './career/CareerPage';
import { DemographicsPage } from './demographics/DemographicsPage';
import { Headline } from '../components/Headline';
import { SCHOOL_SECTIONS } from './sections';

/**
 * Rendert den Bereich zur URL (:sectionId) aus SCHOOL_SECTIONS: Titel, optionaler Mindestfallzahl-Hinweis,
 * PDF-Report-Platzhalter und Skeleton-Karten. Unbekannte ids führen zurück auf /school/overview.
 */
export function SchoolSectionPage() {
  const { sectionId } = useParams();
  const section = SCHOOL_SECTIONS.find((s) => s.id === sectionId);
  // Unbekannter Bereich -> zurück zum Überblick
  if (!section) return <Navigate to="/school/overview" replace />;

  return (
    <>
      <header className="page-head">
        <Headline as="h2" text={section.title} accent={section.accent} />
        <p className="muted">{section.description}</p>
      </header>

      {/* Bereiche mit echter Auswertung */}
      {section.view === 'demographics' && <DemographicsPage />}
      {section.view === 'career' && <CareerPage />}

      {section.minCellNote && <div className="alert alert--info" role="note">{section.minCellNote}</div>}

      {section.pdfReport && (
        <section className="card" aria-labelledby="pdf-title">
          <h3 id="pdf-title">Full report (PDF)</h3>
          <div>
            <button type="button" className="btn btn--primary" disabled>
              Report will be available once fieldwork is complete
            </button>
          </div>
        </section>
      )}

      <div className="grid">
        {section.cards.map((card) => (
          <article key={card.title} className="card" aria-label={card.title}>
            <h3>{card.title}</h3>
            {card.description && <p className="muted small">{card.description}</p>}
            <div className="skeleton" aria-hidden="true">
              <div className="skeleton__bar" />
              <div className="skeleton__bar" />
              <div className="skeleton__bar" />
            </div>
            <p className="muted small">Analysis coming soon – loaded from aggregates/{'{schoolId}'}</p>
          </article>
        ))}
      </div>
    </>
  );
}
