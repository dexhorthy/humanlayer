import { HumanLayer } from 'humanlayer';
import { config } from 'dotenv';
import { ChatCompletionTool } from 'openai/resources';
import { ClassifiedEmail, classifyEmail, emails } from './common';

config(); // Load environment variables

const hl = new HumanLayer({
    verbose: true,
    runId: 'email-classifier',
});



async function main() {
    try {
        console.log('\nClassifying emails...\n');
        const results: ClassifiedEmail[] = [];

        for (const email of emails) {
            const classification = await classifyEmail(email);
            results.push({
                ...email,
                classification,
            });
        }

        console.log('Results:\n');
        results.forEach(({ id, subject, classification }) => {
            console.log(`${id}: ${subject}\nClassification: ${classification}\n`);
        });
    } catch (error) {
        console.error('Error:', error);
    }

}
main().then(console.log).catch(e => {
    console.error(e);
    process.exit(1);
});