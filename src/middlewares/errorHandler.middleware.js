// middlewares/errorHandler.js
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: typeof err.message === 'string' ? err.message : 'Internal Server Error',
    errors: Array.isArray(err.message) ? err.message.map(m => ({ message: m })) : err.errors || [],
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

export default errorHandler;
