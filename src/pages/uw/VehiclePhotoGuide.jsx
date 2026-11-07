import React from 'react';
import { CORNER_VIEWS } from './vehiclePhotoHelpers';
import styles from './VehiclePhotoLibrary.module.css';

export default function VehiclePhotoGuide({ language = 'en', onLanguage, onCapture, onChoose, items = [], disabled = false }) {
  const spanish = language === 'es';
  return <section className={styles.guide} aria-label={spanish ? 'Guía para fotos del vehículo' : 'Vehicle photo guidelines'}>
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>G&amp;P · FIESTA</span><h2>{spanish ? 'Cómo tomar las fotos del vehículo' : 'How to photograph the vehicle'}</h2></div>
      <div className={styles.language} role="group" aria-label="Guide language">
        <button type="button" aria-pressed={!spanish} onClick={() => onLanguage?.('en')}>English</button>
        <button type="button" aria-pressed={spanish} onClick={() => onLanguage?.('es')}>Español</button>
      </div>
    </div>
    <p className={styles.guideIntro}>{spanish
      ? 'Toma cada foto desde una esquina, mostrando los dos lados que se unen y el vehículo completo. Derecha e izquierda se refieren a los lados del vehículo, como si estuvieras sentado dentro mirando hacia adelante.'
      : 'Take each photo from a corner, showing both adjoining sides and the entire vehicle. Right and left refer to the vehicle’s sides, as if seated inside facing forward.'}</p>
    <div className={styles.guideTips}>{spanish
      ? 'Usa buena iluminación. Mantén el teléfono horizontal y evita reflejos, sombras fuertes y objetos que tapen el vehículo. Incluye las llantas, el techo y las defensas.'
      : 'Use good lighting. Hold the phone horizontally and avoid glare, heavy shadows, and obstructions. Include the tires, roof, and bumpers.'}</div>
    <div className={styles.guideGrid}>{CORNER_VIEWS.map((view,index) => {
      const photo = items.find((item) => item.type === view.key);
      return <article key={view.key} className={styles.guideCard}>
        <div className={styles.referenceImage} style={{ aspectRatio: `${view.crop[2]}/${view.crop[3]}` }}>
          <img src="/vehicle-photo-guidelines.png" alt={spanish ? view.es : view.en}
            style={{ width: `${638 / view.crop[2] * 100}%`, left: `${-view.crop[0] / view.crop[2] * 100}%`, top: `${-view.crop[1] / view.crop[3] * 100}%` }} />
          <span className={styles.referenceBadge}>{spanish ? 'Ejemplo' : 'Example'}</span>
        </div>
        <div className={styles.guideCardBody}>
          <div className={styles.heading}><strong>{index + 1}. {spanish ? view.es : view.en}</strong>{photo && <span className={styles.guideStatus}>{photo.saved ? (spanish ? 'Guardada' : 'Saved') : (spanish ? 'Agregada' : 'Added')}</span>}</div>
          <p>{spanish ? view.instructionEs : view.instructionEn}</p>
          {onCapture && <div className={styles.guideCardActions}>
            <button type="button" disabled={disabled} aria-label={`${spanish ? 'Tomar foto' : 'Take photo'}: ${spanish ? view.es : view.en}`} onClick={() => onCapture(view.key)}>{photo ? (spanish ? 'Volver a tomar' : 'Retake photo') : (spanish ? 'Tomar foto' : 'Take photo')}</button>
            <button type="button" disabled={disabled} aria-label={`${spanish ? 'Elegir foto' : 'Choose photo'}: ${spanish ? view.es : view.en}`} onClick={() => onChoose?.(view.key)}>{spanish ? 'Elegir foto' : 'Choose photo'}</button>
          </div>}
        </div>
      </article>;
    })}</div>
    <p className={styles.small}>{spanish ? 'Estas son las vistas de referencia de G&P. Agrega fotos del VIN, odómetro o daños cuando sean necesarias y sigue cualquier requisito adicional de la aseguradora.' : 'These are G&P’s reference views. Add VIN, odometer, or damage photos as needed and follow any additional carrier requirements.'}</p>
  </section>;
}
