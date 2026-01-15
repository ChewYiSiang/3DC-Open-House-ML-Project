# Reaction Time Game with MediaPipe Hand & Pose Detection

A web-based reaction time test that challenges users to click targets quickly and perform hand/body gestures to prove who has what it takes to be the fastest!

## Features

-   **Reaction Time Test**: 5 rounds of clicking a green dot as fast as possible.
-   **Gesture Verification**:
    -   **Hand Gestures**: Rock ✊, Paper ✋, Scissors ✌️ (powered by MediaPipe Hands).
    -   **Body Gestures**: Hands Up 🙌, T-Pose 🧍, Raise Hand 🙋 (powered by MediaPipe Pose).
-   **Leaderboard**: Persistent local leaderboard to track your best times.
-   **Adaptive Logic**: Intelligently switches between Hand and Pose detection models to optimize performance.

## How to Play

1.  **Enter Name**: Input your player name.
2.  **Reaction Test**: Click the **Green Dot** as fast as you can. Avoid the other colors or a penalty will occur (+1s to the timer)
3.  **Gesture Phase**: Follow the prompt on the screen.
    -   If asked for *Rock/Paper/Scissors*, show your hand to the camera.
    -   If asked for *Hands Up/T-Pose/Raise Hand*, step back and use your upper body.
4.  **Score**: See your total time and rank on the leaderboard.

## Technologies Used

-   **HTML5 / CSS3**: Responsive design.
-   **JavaScript (ES6+)**: Core game logic.
-   **Google MediaPipe**:
    -   `@mediapipe/hands`: For hand gesture recognition.
    -   `@mediapipe/pose`: For body pose detection.

## Setup & Running Locally

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/reaction-time-game.git
    ```
2.  Navigate to the folder:
    ```bash
    cd reaction-time-game
    ```
3.  Open `index.html` in your browser.
    *   *Note*: For the camera to work properly, you might need to serve it via a local server (like Live Server in VS Code) due to browser security restrictions on accessing the webcam from `file://` protocols.
