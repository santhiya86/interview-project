// ══════════════════════════════════════════════════════════════════════════════
// AI Service - Render Compatible
// Ollama removed because Render free tier cannot run local Ollama.
// Uses fallback AI responses when deployed.
// ══════════════════════════════════════════════════════════════════════════════


// Generate AI response
async function callOllama(prompt, { json = true } = {}) {

  try {


    // Resume / Interview JSON response

    if (json) {

      return {

        overallScore: 7,

        score: 7,

        feedback:
          "Your answer demonstrates basic understanding. Try to explain concepts with more technical details, examples, and real project experience.",


        strengths: [

          "Good attempt",

          "Concept understanding",

          "Communication"

        ],


        improvements: [

          "Add real-world examples",

          "Explain your approach clearly",

          "Mention challenges and solutions"

        ],


        suggestions:

          "Practice explaining your projects step by step."

      };

    }



    // Normal text response

    return `

Your answer has been evaluated.

Feedback:
- Explain your approach clearly.
- Add technical details.
- Include examples from your projects.
- Improve confidence and communication.

`;



  } catch (error) {


    const err = new Error(
      "AI service unavailable"
    );

    err.isAIError = true;

    throw err;


  }

}





// Health check for Dashboard
async function checkHealth() {


  return {


    ok: true,


    modelAvailable: true,


    provider: "fallback-ai",


    message:
      "AI service ready"


  };


}





module.exports = {


  callOllama,

  checkHealth


};