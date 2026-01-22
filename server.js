const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - Updated CORS to allow Vercel frontend
app.use(cors({
  origin: [
    'https://calculator-kappa-inky-45.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB connection URL - update this with your Atlas connection string
const uri = process.env.MONGODB_URI || "mongodb+srv://sidharthasahanii_db_user:ramapple@exoensetrack.jb0hjum.mongodb.net/?appName=exoensetrack";
const dbName = process.env.DB_NAME || 'expencetrack'; // Your database name

// Connect to MongoDB
let db;

async function startServer() {
  try {
    const client = await MongoClient.connect(uri);
    console.log('Connected to MongoDB Atlas');
    db = client.db(dbName);
    
    // Define all routes after database connection is established
    
    // Get all financial data
    app.get('/api/financial-data', async (req, res) => {
      try {
        const transactions = await db.collection('transactions').find().toArray();
        const loans = await db.collection('loans').find().toArray();
        
        // Convert MongoDB _id to id for compatibility with client-side
        const formattedTransactions = transactions.map(t => ({
          ...t,
          id: t._id.toString()
        }));
        
        const formattedLoans = loans.map(l => ({
          ...l,
          id: l._id.toString(),
          remaining: l.amount - (l.totalPaid || 0)  // Calculate remaining amount
        }));
        
        // Calculate totals
        let totalIncome = 0;
        let totalExpense = 0;
        let totalLoan = 0;
        
        formattedTransactions.forEach(transaction => {
          if (transaction.type === 'income') {
            totalIncome += transaction.amount;
          } else if (transaction.type === 'expense') {
            totalExpense += transaction.amount;
          }
        });
        
        formattedLoans.forEach(loan => {
          totalLoan += loan.remaining; // Use remaining amount instead of original amount
        });
        
        const currentBalance = totalIncome - totalExpense; // Loans don't affect current balance
        
        res.json({
          transactions: formattedTransactions,
          loans: formattedLoans,
          totalIncome,
          totalExpense,
          totalLoan,
          currentBalance
        });
      } catch (error) {
        console.error('Error fetching financial data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Add income
    app.post('/api/income', async (req, res) => {
      try {
        const { name, amount, category } = req.body;
        const newIncome = {
          name,
          amount: parseFloat(amount),
          category,
          type: 'income',
          date: new Date().toLocaleString(),
          edited: false
        };

        const result = await db.collection('transactions').insertOne(newIncome);
        res.status(201).json({ ...newIncome, id: result.insertedId.toString() });
      } catch (error) {
        console.error('Error adding income:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Add expense
    app.post('/api/expense', async (req, res) => {
      try {
        const { name, amount, category } = req.body;
        const newExpense = {
          name,
          amount: parseFloat(amount),
          category,
          type: 'expense',
          date: new Date().toLocaleString(),
          edited: false
        };

        const result = await db.collection('transactions').insertOne(newExpense);
        res.status(201).json({ ...newExpense, id: result.insertedId.toString() });
      } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Add loan
    app.post('/api/loan', async (req, res) => {
      try {
        const { name, amount, interest } = req.body;
        const newLoan = {
          name,
          amount: parseFloat(amount),
          interest: parseFloat(interest),
          type: 'loan',
          category: 'loan',
          date: new Date().toLocaleString(),
          edited: false,
          totalPaid: 0  // Track amount paid toward the loan
        };

        const result = await db.collection('loans').insertOne(newLoan);
        res.status(201).json({ ...newLoan, id: result.insertedId.toString() });
      } catch (error) {
        console.error('Error adding loan:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update transaction
    app.put('/api/transaction/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { name, amount, category } = req.body;

        console.log('PUT /api/transaction/:id called with ID:', id, 'Body:', { name, amount, category });

        const updatedTransaction = {
          name,
          amount: parseFloat(amount),
          category,
          edited: true,
          date: new Date().toLocaleString()
        };

        // Try to convert to ObjectId, fallback to string if it fails
        let objectId;
        try {
          objectId = new ObjectId(id);
        } catch {
          objectId = id; // fallback to string if not a valid ObjectId
        }

        console.log('Converted ID to:', objectId, 'Type:', typeof objectId);

        const result = await db.collection('transactions').updateOne(
          { _id: objectId },
          { $set: updatedTransaction }
        );

        console.log('Update result:', result);

        if (result.matchedCount === 0) {
          console.log('No transaction found with ID:', id);
          return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json({ id, ...updatedTransaction });
      } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update loan
    app.put('/api/loan/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { name, amount, interest } = req.body;

        console.log('PUT /api/loan/:id called with ID:', id, 'Body:', { name, amount, interest });

        // Try to convert to ObjectId, fallback to string if it fails
        let objectId;
        try {
          objectId = new ObjectId(id);
        } catch {
          objectId = id; // fallback to string if not a valid ObjectId
        }

        // Get the existing loan to preserve the totalPaid value
        const existingLoan = await db.collection('loans').findOne({ _id: objectId });

        const updatedLoan = {
          name,
          amount: parseFloat(amount),
          interest: parseFloat(interest),
          edited: true,
          date: new Date().toLocaleString(),
          totalPaid: existingLoan.totalPaid || 0  // Preserve the total paid amount
        };

        console.log('Converted ID to:', objectId, 'Type:', typeof objectId);

        const result = await db.collection('loans').updateOne(
          { _id: objectId },
          { $set: updatedLoan }
        );

        console.log('Update loan result:', result);

        if (result.matchedCount === 0) {
          console.log('No loan found with ID:', id);
          return res.status(404).json({ error: 'Loan not found' });
        }

        res.json({ id, ...updatedLoan });
      } catch (error) {
        console.error('Error updating loan:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Delete transaction
    app.delete('/api/transaction/:id', async (req, res) => {
      try {
        const { id } = req.params;

        console.log('DELETE /api/transaction/:id called with ID:', id);

        // Try to convert to ObjectId, fallback to string if it fails
        let objectId;
        try {
          objectId = new ObjectId(id);
          console.log('Successfully converted to ObjectId:', objectId);
        } catch (err) {
          console.log('Failed to convert to ObjectId, using as string:', err.message);
          objectId = id; // fallback to string if not a valid ObjectId
        }

        console.log('Using ID for deletion:', objectId, 'Type:', typeof objectId);

        // Log all transactions to see what's in the collection
        const allTransactions = await db.collection('transactions').find({}).toArray();
        console.log('All transactions in DB:', allTransactions.map(t => ({ id: t._id.toString(), name: t.name })));

        const result = await db.collection('transactions').deleteOne({
          _id: objectId
        });

        console.log('Delete result:', result);

        if (result.deletedCount === 0) {
          console.log('No transaction found with ID:', id);
          console.log('Available transaction IDs:', allTransactions.map(t => t._id.toString()));
          return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json({ message: 'Transaction deleted successfully' });
      } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
      }
    });

    // Delete loan
    app.delete('/api/loan/:id', async (req, res) => {
      try {
        const { id } = req.params;

        console.log('DELETE /api/loan/:id called with ID:', id);

        // Try to convert to ObjectId, fallback to string if it fails
        let objectId;
        try {
          objectId = new ObjectId(id);
          console.log('Successfully converted to ObjectId:', objectId);
        } catch (err) {
          console.log('Failed to convert to ObjectId, using as string:', err.message);
          objectId = id; // fallback to string if not a valid ObjectId
        }

        console.log('Using ID for loan deletion:', objectId, 'Type:', typeof objectId);

        // Log all loans to see what's in the collection
        const allLoans = await db.collection('loans').find({}).toArray();
        console.log('All loans in DB:', allLoans.map(l => ({ id: l._id.toString(), name: l.name })));

        const result = await db.collection('loans').deleteOne({
          _id: objectId
        });

        console.log('Delete loan result:', result);

        if (result.deletedCount === 0) {
          console.log('No loan found with ID:', id);
          console.log('Available loan IDs:', allLoans.map(l => l._id.toString()));
          return res.status(404).json({ error: 'Loan not found' });
        }

        res.json({ message: 'Loan deleted successfully' });
      } catch (error) {
        console.error('Error deleting loan:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
      }
    });

    // Record partial loan payment
    app.post('/api/loan/:id/payment', async (req, res) => {
      try {
        const { id } = req.params;
        const { amount } = req.body;

        console.log('POST /api/loan/:id/payment called with ID:', id, 'Amount:', amount);

        // Try to convert to ObjectId, fallback to string if it fails
        let objectId;
        try {
          objectId = new ObjectId(id);
          console.log('Successfully converted to ObjectId:', objectId);
        } catch (err) {
          console.log('Failed to convert to ObjectId, using as string:', err.message);
          objectId = id; // fallback to string if not a valid ObjectId
        }

        // Get the loan to update
        const loan = await db.collection('loans').findOne({ _id: objectId });

        if (!loan) {
          console.log('No loan found with ID:', id);
          return res.status(404).json({ error: 'Loan not found' });
        }

        // Calculate new total paid and remaining amount
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
          console.log('Invalid payment amount:', amount);
          return res.status(400).json({ error: 'Invalid payment amount' });
        }
                
        // Calculate the maximum amount that can be paid
        const maxPayableAmount = loan.amount - (loan.totalPaid || 0);
                
        if (paymentAmount > maxPayableAmount) {
          console.log('Payment amount exceeds remaining balance. Requested:', paymentAmount, 'Max payable:', maxPayableAmount);
          return res.status(400).json({ 
            error: 'Payment amount exceeds remaining balance',
            remainingBalance: maxPayableAmount
          });
        }
                
        const newTotalPaid = (loan.totalPaid || 0) + paymentAmount;
        const newRemaining = loan.amount - newTotalPaid; // Now we're sure it won't be negative

        // Update the loan with new payment information
        const result = await db.collection('loans').updateOne(
          { _id: objectId },
          { 
            $set: { 
              totalPaid: newTotalPaid
            } 
          }
        );

        console.log('Payment recorded, new total paid:', newTotalPaid, 'remaining:', newRemaining);

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Loan not found' });
        }

        res.json({ 
          message: 'Payment recorded successfully',
          totalPaid: newTotalPaid,
          remaining: newRemaining,
          loanId: id
        });
      } catch (error) {
        console.error('Error recording loan payment:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
      }
    });

    // Start the server after database connection is established
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

startServer();