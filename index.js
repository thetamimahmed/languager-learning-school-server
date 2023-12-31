const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
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
        if (err) {
            res.status(401).send({ error: true, message: 'Unauthorized Access' })
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
        const bookingCollection = client.db("LLCDB").collection("bookingClasses");
        const addedClassCollection = client.db("LLCDB").collection("addedClass");
        const paymentCollection = client.db("LLCDB").collection("payments");

        //jwt
        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send(token)
        })
        //verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
              return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
          }
        //verify Instructor
        const verifyInstructor= async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
              return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
          }
        //Both  Admin and Instructor
        const verifyAdminInstructor= async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor' && user?.role !== 'admin') {
              return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
          }

        //users
        app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.post("/users", async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'User Exist' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.patch("/users/:newRole/:id", async (req, res) => {
            const newRole = req.params.newRole;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: newRole
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })

        app.get("/users/:role/:email", async (req, res) => {
            const role = req.params.role;
            const email = req.params.email;

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { role: user?.role === role }
            res.send(result)
        })

        app.get("/instructors", async(req, res)=>{
            const query = {role : "instructor"}
            const result = await usersCollection.find(query).toArray()
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

        app.post("/classes", async (req, res) => {
            const approveClass = req.body;
            approveClass._id = new ObjectId(approveClass._id)
            const result = await classCollection.insertOne(approveClass)
            res.send(result)
        })

        app.patch("/classes/:id", async (req, res) => {
            const id = req.params.id;
            const myClass = req.body;
            console.log(myClass)
            const filter = { _id: new ObjectId(id) };
            console.log(filter)
            const updateDoc = {
                $inc: {
                    total_enroll: myClass.available_seats > 0 ? 1 : 0,
                    available_seats: myClass.available_seats > 0 ? -1 : 0,
                  },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);
        })



        //added pending class
        app.put("/addedClasses/:id", async(req, res)=>{
            const id = req.params.id
            const updateData = req.body;
            const filter = {_id: new ObjectId(id)}
            const updateDoc = {
                $set: {
                  name: updateData.name,
                  price: updateData.price,
                  available_seats: updateData.available_seats,
                },
              };
            const result = await addedClassCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        app.post("/addedClasses", verifyJWT, async (req, res) => {
            const addedClass = req.body
            const result = await addedClassCollection.insertOne(addedClass)
            res.send(result)
        })

        app.get("/addedClasses", verifyJWT, verifyAdminInstructor, async (req, res) => {
            const email = req.query?.email
            let query = {}
            if (email) {
                query = { email: email }
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
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    feedback: feedbackText.feedback
                },
            };

            const result = await addedClassCollection.updateOne(filter, updateDoc);
            res.send(result);

        })


        //booking class
        app.post("/bookingclasses", async (req, res) => {
            const selectClass = req.body;
            const result = await bookingCollection.insertOne(selectClass)
            res.send(result)
        })

        app.get("/bookingclasses", verifyJWT, async (req, res) => {
            const email = req.query?.email;
            if (!email) {
                res.send([])
            }
            const decodedEmail = req.decoded?.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'Forbidden Access' })
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

        //create payment intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post("/payments", async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment)
            res.send(result)
        })

        app.get("/payments", async(req, res)=>{
            const query = {email: req.query?.email}
            const result = await paymentCollection.find(query).sort({date: -1}).toArray()
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