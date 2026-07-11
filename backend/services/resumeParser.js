// ══════════════════════════════════════════════════════════════════════════════
// Rule-based Resume Parser — works WITHOUT Ollama.
// Extracts skills, projects, education, experience using regex patterns.
// Render free tier compatible.
// ══════════════════════════════════════════════════════════════════════════════


const PROGRAMMING_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c++",
  "c#",
  "c",
  "ruby",
  "go",
  "rust",
  "kotlin",
  "swift",
  "php",
  "scala",
  "r",
  "matlab",
  "perl",
  "dart",
  "sql",
  "mysql",
  "mongodb"
];


const FRAMEWORKS = [
  "react",
  "react.js",
  "angular",
  "vue",
  "next.js",
  "nextjs",
  "express",
  "express.js",
  "node",
  "node.js",
  "nodejs",
  "fastapi",
  "django",
  "flask",
  "spring",
  "laravel",
  "tailwind",
  "tailwind css",
  "bootstrap",
  "redux",
  "graphql",
  "rest api",
  "mongoose",
  "firebase",
  "aws",
  "azure",
  "docker",
  "kubernetes",
  "git",
  "github",
  "linux"
];


const SKILLS_KEYWORDS = [
  "html",
  "css",
  "sql",
  "nosql",
  "json",
  "xml",
  "api",
  "agile",
  "scrum",
  "devops",
  "machine learning",
  "deep learning",
  "nlp",
  "data structures",
  "algorithms",
  "object oriented programming",
  "oops",
  "microservices",
  "testing",
  "jest",
  "mocha",
  "mern",
  "full stack",
  "web development"
];


// Extract resume sections
function extractSection(text, headings) {

  const lines = text.split("\n");

  let inSection = false;

  const result = [];


  for(let i = 0; i < lines.length; i++){

    const line = lines[i].trim();

    const lower = line.toLowerCase();


    const isHeading =
      headings.some(h => lower.includes(h)) &&
      line.length < 60;


    const nextLine = lines[i + 1]
      ? lines[i + 1].trim().toLowerCase()
      : "";


    const isNextHeading =
      [
        "experience",
        "education",
        "project",
        "skill",
        "certification",
        "achievement",
        "summary",
        "objective",
        "profile"
      ].some(h => nextLine.startsWith(h))
      &&
      nextLine.length < 60;



    if(isHeading){
      inSection = true;
      continue;
    }


    if(inSection && isNextHeading){
      inSection = false;
      continue;
    }


    if(inSection && line.length > 2){
      result.push(line);
    }

  }


  return result;
}




function parseResume(rawText){


  const text = rawText || "";

  const lower = text.toLowerCase();


  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);



  // ================= Skills =================

  const languages =
    PROGRAMMING_LANGUAGES.filter(skill =>
      lower.includes(skill)
    );


  const frameworks =
    FRAMEWORKS.filter(skill =>
      lower.includes(skill)
    );


  const skills =
    SKILLS_KEYWORDS.filter(skill =>
      lower.includes(skill)
    );




  // ================= Projects =================


  const projectLines =
    extractSection(
      text,
      [
        "project",
        "projects",
        "personal project",
        "academic project"
      ]
    );


  const projects = [];

  let currentProject = null;



  for(const line of projectLines){


    const cleanLine =
      line.replace(/^[-•]\s*/, "");



    if(
      cleanLine.length < 80 &&
      /^[A-Z]/.test(cleanLine) &&
      !cleanLine.toLowerCase().includes("technology") &&
      !cleanLine.toLowerCase().includes("tools")
    ){


      if(currentProject){
        projects.push(currentProject);
      }


      currentProject = {

        name: cleanLine,

        summary:"",

        tech:[]

      };


    }


    else if(currentProject){


      if(!currentProject.summary){

        currentProject.summary =
          cleanLine;

      }



      [
        ...PROGRAMMING_LANGUAGES,
        ...FRAMEWORKS
      ].forEach(tech=>{


        if(
          cleanLine
          .toLowerCase()
          .includes(tech)
          &&
          !currentProject.tech.includes(tech)
        ){

          currentProject.tech.push(tech);

        }


      });



    }



  }



  if(currentProject){
    projects.push(currentProject);
  }






  // ================= Education =================


  const eduLines =
    extractSection(
      text,
      [
        "education",
        "academic",
        "qualification"
      ]
    );


  const education=[];



  for(const line of eduLines){


    const year =
      line.match(/\b(19|20)\d{2}\b/);



    if(line.length > 10){

      education.push({

        degree:
          line
          .replace(/\b(19|20)\d{2}\b.*/, "")
          .trim(),

        institution:"",

        year:
          year ? year[0] : ""

      });

    }


  }





  // ================= Experience =================


  const expLines =
    extractSection(
      text,
      [
        "experience",
        "work experience",
        "employment",
        "internship"
      ]
    );


  const experience=[];



  for(const line of expLines){


    if(
      line.length > 10 &&
      line.length < 100
    ){

      experience.push({

        role:line,

        company:"",

        duration:"",

        summary:""

      });


    }


  }





  // ================= Name =================


  const name =
    lines.find(line =>
      /^[A-Za-z ]+$/.test(line)
      &&
      line.length > 3
      &&
      line.length < 40
    )
    ||
    "";





  // ================= Summary =================


  const summaryLines =
    extractSection(
      text,
      [
        "summary",
        "profile",
        "objective"
      ]
    );


  const summary =
    summaryLines.join(" ");







  // ================= Questions =================


  const questions=[];



  projects.slice(0,3)
  .forEach(project=>{


    questions.push({

      question:
      `Explain your "${project.name}" project in detail.`,

      category:"Project",

      difficulty:"Medium",

      targetSkill:project.name

    });



    if(project.tech.length){

      questions.push({

        question:
        `Why did you choose ${project.tech[0]} for your "${project.name}" project?`,

        category:"Technical",

        difficulty:"Medium",

        targetSkill:project.tech[0]

      });


    }


  });





  if(languages.length){

    questions.push({

      question:
      `How proficient are you in ${languages[0]}? Rate yourself and explain.`,

      category:"Technical",

      difficulty:"Easy",

      targetSkill:languages[0]

    });

  }





  if(frameworks.length){

    questions.push({

      question:
      `Describe how you have used ${frameworks[0]} in your projects.`,

      category:"Technical",

      difficulty:"Medium",

      targetSkill:frameworks[0]

    });

  }






  questions.push({

    question:
    "What was the biggest technical challenge you faced and how did you overcome it?",

    category:"Behavioral",

    difficulty:"Medium",

    targetSkill:"Problem Solving"

  });



  questions.push({

    question:
    "Walk me through your most significant project from start to finish.",

    category:"Project",

    difficulty:"Hard",

    targetSkill:"Communication"

  });



  questions.push({

    question:
    "How do you stay updated with new technologies in your field?",

    category:"Behavioral",

    difficulty:"Easy",

    targetSkill:"Learning"

  });



  questions.push({

    question:
    "Where do you see yourself in 3-5 years?",

    category:"HR",

    difficulty:"Easy",

    targetSkill:"Career Goals"

  });







  return {


    candidate:{


      name,

      summary,

      skills,

      languages,

      frameworks,

      projects,

      education,

      experience,

      certifications:[],

      achievements:[]


    },


    questions:
      questions.slice(0,10)


  };


}



module.exports = {
  parseResume
};