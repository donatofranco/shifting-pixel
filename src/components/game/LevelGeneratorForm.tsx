
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
import { handleGenerateLevelAction } from '@/app/actions';
import type { GenerateLevelInput, GenerateLevelOutput } from '@/ai/flows/generate-level';
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

// Simplified form schema, only difficulty
const formSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

// Values from this form will only contain difficulty
type LevelGeneratorFormValues = z.infer<typeof formSchema>;

interface LevelGeneratorFormProps {
  onLevelGenerated: (data: GenerateLevelOutput) => void;
  setIsLoadingLevel: (isLoading: boolean) => void;
  initialValues?: Pick<GenerateLevelInput, 'difficulty'>; // Only difficulty needed for initial values
  onFormSubmitted?: () => void;
}

const LevelGeneratorForm: FC<LevelGeneratorFormProps> = ({ 
    onLevelGenerated, 
    setIsLoadingLevel, 
    initialValues,
    onFormSubmitted 
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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
    setIsLoadingLevel(true);
    try {
      // The 'values' here only has 'difficulty'.
      // handleGenerateLevelAction will now derive the other parameters.
      const result = await handleGenerateLevelAction(values); 
      if ('error' in result) {
        console.error("Generation error:", result.error);
        toast({
          variant: "destructive",
          title: "Level Generation Failed",
          description: result.error || "An unknown error occurred.",
        });
      } else {
        onLevelGenerated(result);
        toast({
          title: "Level Generated Manually!",
          description: "The new level is ready for play.",
        });
        if (onFormSubmitted) {
            onFormSubmitted();
        }
      }
    } catch (error) {
      console.error("Unexpected error submitting form:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while generating the level.",
      });
    } finally {
      setIsSubmitting(false);
      setIsLoadingLevel(false);
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
