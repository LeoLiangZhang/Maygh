#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <string.h>
#include <errno.h>
#include <sys/time.h>

using namespace v8;
using namespace node;

class CHelper: ObjectWrap
{
private:

public:

	static Persistent<FunctionTemplate> s_ct;

	static void init (Handle<Object> target)
	{
		HandleScope scope;

		target->Set(String::New("version"), String::New("0.1"));

		Local<FunctionTemplate> t = FunctionTemplate::New(New);

		s_ct = Persistent<FunctionTemplate>::New(t);
		s_ct->InstanceTemplate()->SetInternalFieldCount(1);
		s_ct->SetClassName(String::NewSymbol("CHelper"));

		NODE_SET_PROTOTYPE_METHOD(s_ct, "now", now);

		target->Set(String::NewSymbol("CHelper"), s_ct->GetFunction());
	}

	CHelper()
	{
	}

	~CHelper(){}

	/*
	 * Get the current time in microseconds as an integer. Since JavaScript can only represent integer values accurately up to Math.pow(2, 53), this value will be accurate up to Tue, 05 Jun 2255 23:47:34 GMT.
	 * @see: https://github.com/wadey/node-microtime
	 */
	static Handle<Value> now(const Arguments &args) {
		HandleScope scope;

		timeval t;
		int r = gettimeofday(&t, NULL);

		if (r < 0) {
			return ThrowException(ErrnoException(errno, "gettimeofday"));
		}

		return scope.Close(Number::New((t.tv_sec * 1000000.0) + t.tv_usec));
	}

	static Handle<Value> New(const Arguments& args)
	{

		HandleScope scope;
		CHelper* hw = new CHelper();
		hw->Wrap(args.This());
		return args.This();
	}


};

Persistent<FunctionTemplate> CHelper::s_ct;

//Node module exposure
extern "C" {

	static void init (Handle<Object> target)
	{
		CHelper::init(target);
	}
	NODE_MODULE(chelper, init);
}
