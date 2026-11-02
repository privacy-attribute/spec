import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '../ui';

const CONDITIONS = ['Diabetes', 'Asthma', 'Depression', 'Heart disease'];

export function HealthQuestionnaire() {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pick = (q: string, v: string) => setAnswers({ ...answers, [q]: v });
  return (
    <form className="questionnaire">
      <fieldset>
        <legend>Do you smoke?</legend>
        <label><input type="radio" name="smoker" value="yes" /> Yes</label> {/* @expect personal block */}
        <label><input type="radio" name="smoker" value="no" /> No</label> {/* @expect personal block */}
      </fieldset>
      <fieldset>
        <legend>Diagnosed conditions</legend>
        {CONDITIONS.map((c) => <label key={c}><input type="checkbox" name="conditions" value={c} /> {c}</label>)} {/* @expect personal block */}
      </fieldset>
      <RadioGroup name="pregnant" onValueChange={(v) => pick('pregnant', v)}> {/* @expect personal block */}
        <RadioGroupItem value="yes">Yes</RadioGroupItem>
        <RadioGroupItem value="no">No</RadioGroupItem>
      </RadioGroup>
      <div className="mood-scale">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} aria-pressed={answers.mood === String(n)} onClick={() => pick('mood', String(n))}>{n}</button> // @expect personal block
        ))}
      </div>
      <textarea name="symptoms" placeholder="Describe your symptoms" /> {/* @expect personal ignore */}
      <p className="summary">Your answer: {answers.medication}</p> {/* @expect personal mask */}
    </form>
  );
}
