const BACK_BUTTON =
    document.getElementById(
        "backButton"
    );

const SESSION_TOOL =
    document.getElementById(
        "sessionTool"
    );

const FOLLOWERS_TOOL =
    document.getElementById(
        "followersTool"
    );

const FOLLOWING_TOOL =
    document.getElementById(
        "followingTool"
    );


BACK_BUTTON.addEventListener(
    "click",
    () => {

        window.location.href =
            "../../popup/popup.html";
    }
);


SESSION_TOOL.addEventListener(
    "click",
    () => {

        window.location.href =
            "./session/session.html";
    }
);


FOLLOWERS_TOOL.addEventListener(
    "click",
    () => {

        window.location.href =
            "./followers/followers.html";
    }
);


FOLLOWING_TOOL.addEventListener(
    "click",
    () => {

        window.location.href =
            "./following/following.html";
    }
);