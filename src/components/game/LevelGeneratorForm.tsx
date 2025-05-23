
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
import type { GenerateLevelInput } from '@/ai/flows/generate-level';
import { Loader2 } from 'lucide-react';

const formSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

type LevelGeneratorFormValues = z.infer<typeof formSchema>;

interface LevelGeneratorFormProps {
  onGenerateRequested: (formData: LevelGeneratorFormValues) => Promise<void>;
  initialDifficulty?: GenerateLevelInput['difficulty']; 
  onFormSubmitted?: () => void; 
}

const LevelGeneratorForm: FC<LevelGeneratorFormProps> = ({ 
    onGenerateRequested, 
    initialDifficulty,
    onFormSubmitted 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LevelGeneratorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      difficulty: initialDifficulty || 'medium',
    },
  });

  useEffect(() => {
    if (initialDifficulty) {
      form.reset({ difficulty: initialDifficulty });
    }
  }, [initialDifficulty, form]);

  const onSubmit: SubmitHandler<LevelGeneratorFormValues> = async (values) => {
    setIsSubmitting(true);
    try {
      await onGenerateRequested(values); 
      if (onFormSubmitted) {
          onFormSubmitted(); 
      }
    } catch (error) {
      console.error("Error during onGenerateRequested call from LevelGeneratorForm:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <CardHeader className="p-0 pb-2">
        <CardTitle className="text-accent uppercase text-base tracking-wider text-center">New Level</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 text-xs sr-only">Difficulty</FormLabel>
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
