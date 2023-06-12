const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors())
app.use(express.json())


const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        res.status(401).send({ error: true, message: 'Unauthorized Access' })
    }
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if(err){
            res.status(401).send({error:true, message:'Unauthorized Access'})
        }
        req.decoded = decoded
        next()
    });
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rgrretg.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const usersCollection = client.db("LLCDB").collection("users");
        const classCollection = client.db("LLCDB").collection("classCollection");
        const instructorCollection = client.db("LLCDB").collection("instructors");
        const bookingCollection = client.db("LLCDB").collection("bookingClasses");
        const addedClassCollection = client.db("LLCDB").collection("addedClass");

        //jwt
        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send(token)
        })

        //users
        app.post("/users", async(req, res)=>{
            const user = req.body
            const query = {email: user.email}
            const existingUser = await usersCollection.findOne(query)
            if(existingUser){
                return res.send({message: 'User Exist'})
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        //get classes
        app.get("/classes", async (req, res) => {
            const query = {}
            const options = {
                sort: { "total_enroll": -1 }
            }
            const result = await classCollection.find(query, options).toArray()
            res.send(result)
        })

        app.post("/classes", async(req, res)=>{
            const approveClass = req.body;
            const result = await classCollection.insertOne(approveClass)
            res.send(result)
        })

       

        //added pending class
        app.post("/addedClasses", verifyJWT, async(req, res)=>{
            const addedClass = req.body
            const result = await addedClassCollection.insertOne(addedClass)
            res.send(result)
        })

        app.get("/addedClasses", verifyJWT, async(req, res)=>{
            const email = req.query?.email
            let query = {}
            if(email){
                query = {email: email}
            }
            const result = await addedClassCollection.find(query).toArray()
            res.send(result)
        })

        app.patch('/addedClasses/:status/:id', async (req, res) => {
            const status = req.params.status;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
              $set: {
                status: status === 'Approve' ? 'Approve' : 'Deny'
              },
            };
      
            const result = await addedClassCollection.updateOne(filter, updateDoc);
            res.send(result);
      
          })

        app.patch('/addedClasses/:id', async (req, res) => {
            const id = req.params.id;
            const feedbackText = req.body;
            console.log(feedbackText)
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
              $set: {
                feedback:feedbackText.feedback
              },
            };
      
            const result = await addedClassCollection.updateOne(filter, updateDoc);
            res.send(result);
      
          })

        //get instructors
        app.get("/instructors", async (req, res) => {
            const query = {}
            const options = {
                sort: { "students_in_class": -1 }
            }
            const result = await instructorCollection.find(query, options).toArray()
            res.send(result)
        })

        //booking class
        app.post("/bookingclasses", async (req, res) => {
            const selectClass = req.body;
            const result = await bookingCollection.insertOne(selectClass)
            res.send(result)
        })

        app.get("/bookingclasses", verifyJWT, async (req, res) => {
            const email = req.query?.email;
            if(!email){
                res.send([])
            }
            const decodedEmail = req.decoded?.email;
            if(email !== decodedEmail){
                return res.status(403).send({error: true, message: 'Forbidden Access'})
            }
            const query = { email: email }
            const result = await bookingCollection.find(query).toArray()
            res.send(result)
        })

        app.delete("/bookingclasses", async (req, res) => {
            const id = req.query.id;
            const query = { _id: new ObjectId(id) }
            const result = await bookingCollection.deleteOne(query)
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("LLC Is Running")
})

app.listen(port, () => {
    console.log(`LLC is running on ${port}`)
})