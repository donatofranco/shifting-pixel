
// @ts-nocheck
// TODO: Fix TS errors
"use client";

import type { FC } from 'react';
import { useState, useEffect } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
// Removed direct import of handleGenerateLevelAction
import type { GenerateLevelInput } from '@/ai/flows/generate-level';
import { Loader2 } from 'lucide-react';
// Removed useToast as HomePage will handle toasts for manual generation

// Simplified form schema, only difficulty
const formSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

// Values from this form will only contain difficulty
type LevelGeneratorFormValues = z.infer<typeof formSchema>;

interface LevelGeneratorFormProps {
  onGenerateRequested: (formData: LevelGeneratorFormValues) => Promise<void>; // Changed prop name
  initialValues?: Pick<GenerateLevelInput, 'difficulty'>; 
  onFormSubmitted?: () => void;
}

const LevelGeneratorForm: FC<LevelGeneratorFormProps> = ({ 
    onGenerateRequested, 
    initialValues,
    onFormSubmitted 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Removed toast from here

  const form = useForm<LevelGeneratorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues || {
      difficulty: 'medium',
    },
  });

  useEffect(() => {
    if (initialValues) {
      form.reset(initialValues);
    }
  }, [initialValues, form]);

  const onSubmit: SubmitHandler<LevelGeneratorFormValues> = async (values) => {
    setIsSubmitting(true);
    try {
      await onGenerateRequested(values); // Call the new prop
      // Toasting and state updates (isLoadingLevel, generatedLevel, levelCount) are now handled by HomePage
      if (onFormSubmitted) {
          onFormSubmitted();
      }
    } catch (error) {
      // Error handling for the generation process itself should be in HomePage
      // This form's error handling is now minimal, mostly for the submit process if needed
      console.error("Error during onGenerateRequested call:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CardHeader className="p-4 pt-0 pb-2">
        <CardTitle className="text-accent uppercase text-lg tracking-wider">Level Generator</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 text-xs">Difficulty</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring h-9 text-xs">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground uppercase tracking-wider text-sm py-2 h-9" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Level'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </>
  );
};

export default LevelGeneratorForm;

    