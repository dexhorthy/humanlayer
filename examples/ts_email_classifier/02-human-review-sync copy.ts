import { HumanLayer, ResponseOption } from "humanlayer";
import { config } from "dotenv";
import { ChatCompletionTool } from "openai/resources";
import { Classification, classificationValues, ClassifiedEmail, classifyEmail, emails } from "./common";

config(); // Load environment variables

const hl = new HumanLayer({
    verbose: true,
    runId: "email-classifier",
});

async function main() {
    try {
        console.log("\nClassifying emails...\n");
        const results: ClassifiedEmail[] = [];

        for (const email of emails) {
            const classification = await classifyEmail(email);
            const { subject, body, to, from } = email
            const remainingOptions = classificationValues.filter((c) => c !== classification);
            const responseOptions: ResponseOption[] = remainingOptions.map((c) => ({
                name: c,
                title: c,
                description: `Classify as ${c}`,
            }));

            const humanReview = await hl.fetchHumanApproval({
                spec: {
                    fn: "classifyEmail",
                    kwargs: {
                        to, from, subject, body, classification
                    },
                    state: {
                        emailId: email.id,
                    },
                    reject_options: responseOptions,
                }
            });

            results.push({
                ...email,
                classification,
                hasHumanReview: true,
                humanComment: humanReview.comment,
                humanClassification: humanReview.response_option_name as Classification | null | undefined,
            });
        }

        console.log("Results:\n");
        results.forEach(({ id, subject, classification }) => {
            console.log(`${id}: ${subject}\nClassification: ${classification}\n`);
        });
    } catch (error) {
        console.error("Error:", error);
    }
}
main()
    .then(console.log)
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
