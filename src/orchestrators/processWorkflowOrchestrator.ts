import * as df from 'durable-functions';
import { WorkflowInput, WorkflowOutput } from '../models/types';

/**
 * Process Workflow Orchestrator
 * Demonstrates HTTP-triggered orchestration with status checkpoints
 * Maintains state across distributed operations
 */
const processWorkflowOrchestrator = df.orchestrator(function* (context) {
    const input: WorkflowInput = context.df.getInput();
    const startTime = Date.now();
    
    context.df.setCustomStatus('Starting workflow');
    
    const results: Record<string, unknown> = {};
    const completedSteps: string[] = [];

    try {
        // Process each step sequentially with checkpoints
        for (const step of input.steps) {
            context.df.setCustomStatus(`Processing step: ${step}`);
            
            // Call activity to process the step
            const stepResult = yield context.df.callActivity('ProcessItemActivity', {
                itemId: step,
                processingDelayMs: 100,
            });
            
            results[step] = stepResult;
            completedSteps.push(step);
            
            // Create checkpoint after each step
            context.df.setCustomStatus(`Completed step: ${step}`);
        }

        // Update metrics after workflow completion
        yield context.df.callActivity('UpdateMetricsActivity', {
            workflowId: input.workflowId,
            duration: Date.now() - startTime,
            success: true,
        });

        const output: WorkflowOutput = {
            workflowId: input.workflowId,
            status: 'completed',
            completedSteps,
            results,
            duration: Date.now() - startTime,
        };

        context.df.setCustomStatus('Workflow completed successfully');
        return output;

    } catch (error) {
        // Update metrics for failed workflow
        yield context.df.callActivity('UpdateMetricsActivity', {
            workflowId: input.workflowId,
            duration: Date.now() - startTime,
            success: false,
            error: String(error),
        });

        const output: WorkflowOutput = {
            workflowId: input.workflowId,
            status: 'failed',
            completedSteps,
            results,
            duration: Date.now() - startTime,
        };

        context.df.setCustomStatus('Workflow failed');
        return output;
    }
});

export default processWorkflowOrchestrator;
