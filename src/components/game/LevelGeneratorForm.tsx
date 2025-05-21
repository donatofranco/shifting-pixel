
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Card components might not be needed if used in Popover
import { handleGenerateLevelAction } from '@/app/actions';
import type { GenerateLevelInput, GenerateLevelOutput } from '@/ai/flows/generate-level';
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";


const formSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  levelLength: z.coerce.number().int().min(10).max(200),
  platformDensity: z.enum(['sparse', 'normal', 'dense']),
  obstacleDensity: z.enum(['low', 'medium', 'high']),
});

type LevelGeneratorFormValues = z.infer<typeof formSchema>;

interface LevelGeneratorFormProps {
  onLevelGenerated: (data: GenerateLevelOutput) => void;
  setIsLoadingLevel: (isLoading: boolean) => void;
  initialValues?: GenerateLevelInput;
  onFormSubmitted?: () => void; // Optional: Callback to notify parent when form is submitted
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
      levelLength: 100,
      platformDensity: 'normal',
      obstacleDensity: 'medium',
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
      const result = await handleGenerateLevelAction(values as GenerateLevelInput);
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
            onFormSubmitted(); // Call this to close popover, for example
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

  // Removed Card wrapper, form will be directly in PopoverContent
  return (
    <>
      <CardHeader className="p-4 pt-0 pb-2"> {/* Adjusted padding for Popover context */}
        <CardTitle className="text-accent uppercase text-lg tracking-wider">Level Generator</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0"> {/* Adjusted padding for Popover context */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4"> {/* Reduced space-y */}
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

            <FormField
              control={form.control}
              name="levelLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 text-xs">Length (Platforms)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="bg-input border-border focus:ring-ring h-9 text-xs" />
                  </FormControl>
                  <FormDescription className="text-muted-foreground text-xs">
                    Platforms (10-200)
                  </FormDescription>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platformDensity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 text-xs">Platform Density</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring h-9 text-xs">
                        <SelectValue placeholder="Select density" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="sparse">Sparse</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="dense">Dense</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="obstacleDensity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80 text-xs">Obstacle Density</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring h-9 text-xs">
                        <SelectValue placeholder="Select density" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
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
                'Generate Manually'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </>
  );
};

export default LevelGeneratorForm;

