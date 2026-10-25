import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

export interface StepperStep {
  id: string;
  label: string;
  /** Optional sublabel shown under the step (e.g. timestamp or who). */
  detail?: ReactNode;
  state: 'done' | 'current' | 'upcoming' | 'branch';
}

/**
 * Horizontal lifecycle stepper (reused for allocation lifecycle). Branch states
 * (cancelled / incident hold) are rendered distinctly rather than on the main line.
 */
export function Stepper({ steps, label }: { steps: StepperStep[]; label?: string }) {
  return (
    <ol className="stepper" aria-label={label ?? 'Lifecycle'}>
      {steps.map((step, i) => (
        <li key={step.id} className={`stepper__step stepper__step--${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="stepper__marker" aria-hidden="true">
            {step.state === 'done' ? <Check size={13} /> : <span className="stepper__dot">{i + 1}</span>}
          </span>
          <span className="stepper__body">
            <span className="stepper__label">{step.label}</span>
            {step.detail ? <span className="stepper__detail">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
