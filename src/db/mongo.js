import mongoose from 'mongoose';

export async function connectMongo(){
  const uri = process.env.MONGODB_URI;
  if(!uri){
    throw new Error('MONGODB_URI is not set');

  }
  if(mongoose.connection.readyState === 1) return;
  await mongoose.connect(uri,{
    serverSelectionTimeoutMS: 5000,
  });
}

export default mongoose;