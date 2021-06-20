const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { APP_SECRET, getUserId } = require('../utils');

//! SIGNUP
async function signup(parent, args, context, info) {
  // In the signup mutation, the first thing to do is encrypt the User’s password using the bcryptjs library
  const password = await bcrypt.hash(args.password, 10);

  // The next step is to use your PrismaClient instance (via prisma) to store the new User record in the database.
  const user = await context.prisma.user.create({
    data: { ...args, password },
  });

  // You’re then generating a JSON Web Token which is signed with an APP_SECRET. You still need to create this APP_SECRET and also install the jwt library that’s used here.
  const token = jwt.sign({ userId: user.id }, APP_SECRET);

  // Finally, you return the token and the user in an object that adheres to the shape of an AuthPayload object from your GraphQL schema.
  return {
    token,
    user,
  };
}

//! LOGIN MUTATIONS
async function login(parent, args, context, info) {
  // Instead of creating a new User object, you’re now using your PrismaClient instance to retrieve an existing User record by the email address that was sent along as an argument in the login mutation. If no User with that email address was found, you’re returning a corresponding error.
  const user = await context.prisma.user.findUnique({
    where: { email: args.email },
  });
  if (!user) {
    throw new Error('No such user found');
  }

  //The next step is to compare the provided password with the one that is stored in the database. If the two don’t match, you’re returning an error as well.
  const valid = await bcrypt.compare(args.password, user.password);
  if (!valid) {
    throw new Error('Invalid password');
  }

  const token = jwt.sign({ userId: user.id }, APP_SECRET);

  // In the end, you’re returning token and user again.
  return {
    token,
    user,
  };
}

async function post(parent, args, context, info) {
  const { userId } = context;

  const newLink = await context.prisma.link.create({
    data: {
      url: args.url,
      description: args.description,
      postedBy: { connect: { id: userId } },
    },
  });
  context.pubsub.publish('NEW_LINK', newLink);

  return newLink;
}

async function vote(parent, args, context, info) {
  // the first step is to validate the incoming JWT with the getUserId helper function. If it’s valid, the function will return the userId of the User who is making the request. If the JWT is not valid, the function will throw an exception.
  const userId = getUserId(context);

  // To protect against those pesky “double voters”, you need to check if the vote already exists or not. First, you try to fetch a vote with the same linkId and userId. If the vote exists, it will be stored in the vote variable, resulting in the boolean true from your call to Boolean(vote) — throwing an error kindly telling the user that they already voted.
  const vote = await context.prisma.vote.findUnique({
    where: {
      linkId_userId: {
        linkId: Number(args.linkId),
        userId: userId,
      },
    },
  });

  if (Boolean(vote)) {
    throw new Error(`Already voted for link: ${args.linkId}`);
  }

  // If that Boolean(vote) call returns false, the vote.create method will be used to create a new Vote that’s connected to the User and the Link.
  const newVote = context.prisma.vote.create({
    data: {
      user: { connect: { id: userId } },
      link: { connect: { id: Number(args.linkId) } },
    },
  });
  context.pubsub.publish('NEW_VOTE', newVote);

  return newVote;
}

module.exports = {
  signup,
  login,
  post,
  vote,
};
