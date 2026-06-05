"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  User,
  Truck,
  CreditCard,
  ListChecks,
  ChevronRight,
  Check,
} from "lucide-react";

type Step = {
  icon: React.ElementType;
  label: string;
};

interface StepsProps {
  steps: Step[];
  activeStep: number;
  onStepChange: (step: number) => void;
}

export function Steps({ steps, activeStep, onStepChange }: StepsProps) {
  return (
    <div className="w-fit mx-auto mt-10">
      <div className="flex items-center p-0.5 gap-1 bg-muted rounded-lg">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-1">
            <Button
              variant={index === activeStep ? "outline" : "ghost"}
              size={index === activeStep ? "default" : "icon"}
              className={`flex items-center gap-2 ${
                index === activeStep
                  ? "hover:bg-background hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onStepChange(index)}
            >
              {index < activeStep ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                React.createElement(step.icon, { className: "w-4 h-4" })
              )}
              {index === activeStep && `${index + 1}. ${step.label}`}
            </Button>
            {index < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Button9() {
  const steps: Step[] = [
    { icon: User, label: "Details" },
    { icon: Truck, label: "Delivery" },
    { icon: CreditCard, label: "Payment" },
    { icon: ListChecks, label: "Overview" },
  ];

  const [activeStep, setActiveStep] = React.useState(1);

  return (
    <Steps steps={steps} activeStep={activeStep} onStepChange={setActiveStep} />
  );
}
